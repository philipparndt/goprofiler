package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"

	"github.com/philipparndt/go-logger"
)

// ErrSessionUnsupported is returned by StartClaudeSession when the installed
// claude CLI does not support `--input-format stream-json` (i.e. too old).
// Callers should fall back to the one-shot RunAnalysis path.
var ErrSessionUnsupported = errors.New("claude CLI does not support streaming input")

// ErrSessionClosed is returned by Send when the session has already been
// closed (either by an explicit Close call or because the CLI process exited).
var ErrSessionClosed = errors.New("claude session closed")

// ClaudeSession wraps a long-lived `claude -p --input-format stream-json ...`
// process. A single session handles a full conversation: the first prompt and
// every follow-up are written as JSON-framed user messages to the process's
// stdin, and its stream-json stdout is parsed into a shared events channel.
//
// One session corresponds to one conversation. Changing the source directory
// or permission level requires closing the session and starting a new one.
type ClaudeSession struct {
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	events    chan StreamEvent
	ctx       context.Context
	cancel    context.CancelFunc
	sourceDir string
	permLvl   PermissionLevel

	mu       sync.Mutex
	closed   bool
	waitDone chan struct{}
}

// StartClaudeSession spawns a long-lived claude process in streaming-input
// mode. The returned session is ready to accept Send calls; the first such
// call writes the initial prompt.
//
// If the claude binary rejects the --input-format flag, the function returns
// ErrSessionUnsupported and the caller should fall back to RunAnalysis.
func StartClaudeSession(parent context.Context, sourceDir string, permLvl PermissionLevel, model ...string) (*ClaudeSession, error) {
	ctx, cancel := context.WithCancel(parent)

	args := []string{
		"--print",
		"--input-format", "stream-json",
		"--output-format", "stream-json",
		"--verbose",
	}
	args = append(args, permissionArgs(permLvl)...)
	if len(model) > 0 && model[0] != "" {
		args = append(args, "--model", model[0])
	}

	cmd := exec.CommandContext(ctx, "claude", args...)
	if sourceDir != "" {
		cmd.Dir = sourceDir
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	// Capture stderr into a ring so we can surface it on crash AND also log it
	// for live debugging. The ring is small (last 4 KB of stderr is plenty for
	// a "unknown option" style rejection).
	stderrTail := newStderrTail(4096)
	go func() {
		teedReader := io.TeeReader(stderrPipe, stderrTail)
		drainToLog(teedReader, "claude stderr")
	}()

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("start claude: %w", err)
	}

	s := &ClaudeSession{
		cmd:       cmd,
		stdin:     stdin,
		events:    make(chan StreamEvent, 128),
		ctx:       ctx,
		cancel:    cancel,
		sourceDir: sourceDir,
		permLvl:   permLvl,
		waitDone:  make(chan struct{}),
	}

	// Parser goroutine: reads stream-json from stdout, emits StreamEvents.
	parserDone := make(chan struct{})
	go func() {
		defer close(parserDone)
		parseClaudeStream(ctx, stdout, sourceDir, s.events)
	}()

	// Waiter goroutine: waits for the process to exit, then detects early-exit
	// conditions (version mismatch, crash). Closes the events channel.
	go func() {
		defer close(s.waitDone)
		<-parserDone
		err := cmd.Wait()

		s.mu.Lock()
		alreadyClosed := s.closed
		s.closed = true
		s.mu.Unlock()

		if err != nil && !alreadyClosed {
			tail := stderrTail.String()
			// Detect the version-mismatch case early so the service can fall
			// back to RunAnalysis instead of reporting a blank failure.
			if looksUnsupported(tail) {
				s.events <- StreamEvent{Type: "error", Error: "claude CLI does not support --input-format stream-json; please update Claude Code"}
			} else if ctx.Err() == nil {
				// Only emit an error if we didn't cancel on purpose.
				msg := "claude process exited unexpectedly: " + err.Error()
				if strings.TrimSpace(tail) != "" {
					msg += "\n" + strings.TrimSpace(tail)
				}
				s.events <- StreamEvent{Type: "error", Error: msg}
			}
		}
		close(s.events)
	}()

	// Sanity check: if the process exits almost immediately with a flag error,
	// short-circuit to ErrSessionUnsupported so the caller can fall back
	// without the user seeing a spurious error event.
	select {
	case <-s.waitDone:
		if looksUnsupported(stderrTail.String()) {
			logger.Warn("claude does not support --input-format stream-json; falling back to one-shot mode")
			return nil, ErrSessionUnsupported
		}
		return nil, fmt.Errorf("claude exited immediately: %s", strings.TrimSpace(stderrTail.String()))
	default:
	}

	return s, nil
}

// Send writes a new user message to the session's stdin in stream-json input
// format. It returns ErrSessionClosed if the session is no longer alive.
func (s *ClaudeSession) Send(message string) error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return ErrSessionClosed
	}
	s.mu.Unlock()

	envelope := map[string]any{
		"type": "user",
		"message": map[string]any{
			"role": "user",
			"content": []map[string]any{
				{"type": "text", "text": message},
			},
		},
	}
	line, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("encode user message: %w", err)
	}
	logger.Debug("claude session send", "bytes", len(line))

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return ErrSessionClosed
	}
	if _, err := s.stdin.Write(append(line, '\n')); err != nil {
		return fmt.Errorf("write to claude stdin: %w", err)
	}
	return nil
}

// Events returns the read side of the session's event channel. The channel is
// closed when the session ends for any reason.
func (s *ClaudeSession) Events() <-chan StreamEvent {
	return s.events
}

// SourceDir returns the working directory the session was spawned in.
func (s *ClaudeSession) SourceDir() string { return s.sourceDir }

// PermLevel returns the permission level the session was spawned with.
func (s *ClaudeSession) PermLevel() PermissionLevel { return s.permLvl }

// Closed reports whether the session has ended.
func (s *ClaudeSession) Closed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

// Close terminates the underlying CLI process and waits for the parser and
// waiter goroutines to finish. Safe to call multiple times.
func (s *ClaudeSession) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		<-s.waitDone
		return
	}
	s.closed = true
	s.mu.Unlock()

	_ = s.stdin.Close()
	s.cancel()
	<-s.waitDone
}

// looksUnsupported returns true when the captured stderr tail suggests the
// installed claude CLI doesn't recognise our streaming-input flags.
func looksUnsupported(stderr string) bool {
	lower := strings.ToLower(stderr)
	if strings.Contains(lower, "unknown option") && strings.Contains(lower, "input-format") {
		return true
	}
	if strings.Contains(lower, "unrecognized") && strings.Contains(lower, "input-format") {
		return true
	}
	return false
}

// stderrTail is a small io.Writer that keeps only the last n bytes written to
// it, so we can surface a trailing snippet of stderr on crash without
// unbounded memory growth.
type stderrTail struct {
	mu   sync.Mutex
	buf  []byte
	max  int
}

func newStderrTail(max int) *stderrTail {
	return &stderrTail{max: max}
}

func (t *stderrTail) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.buf = append(t.buf, p...)
	if over := len(t.buf) - t.max; over > 0 {
		t.buf = t.buf[over:]
	}
	return len(p), nil
}

func (t *stderrTail) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return string(t.buf)
}
