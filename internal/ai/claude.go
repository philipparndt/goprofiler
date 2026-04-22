package ai

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"

	"github.com/philipparndt/go-logger"
)

// StreamEvent represents a single event from Claude Code's stream-json output.
type StreamEvent struct {
	Type      string `json:"type"`
	Content   string `json:"content,omitempty"`
	Error     string `json:"error,omitempty"`
	Activity  string `json:"activity,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
	// WorkingDir is the directory the analysis was spawned in. Claude stores
	// conversations per-project, so `claude --resume <id>` only finds the
	// session when run from the same directory — the UI needs this to build a
	// working copy-paste command.
	WorkingDir string `json:"workingDir,omitempty"`
}

func formatActivity(toolName string, input map[string]any) string {
	switch toolName {
	case "Read":
		if fp, ok := input["file_path"].(string); ok {
			return "Reading " + fp
		}
		return "Reading file"
	case "Glob":
		if p, ok := input["pattern"].(string); ok {
			return "Searching " + p
		}
		return "Searching files"
	case "Grep":
		if p, ok := input["pattern"].(string); ok {
			return "Searching for " + p
		}
		return "Searching code"
	case "Edit":
		if fp, ok := input["file_path"].(string); ok {
			return "Editing " + fp
		}
		return "Editing file"
	case "Write":
		if fp, ok := input["file_path"].(string); ok {
			return "Writing " + fp
		}
		return "Writing file"
	case "Bash":
		if cmd, ok := input["command"].(string); ok {
			if len(cmd) > 60 {
				cmd = cmd[:60] + "..."
			}
			return "Running: " + cmd
		}
		return "Running command"
	case "":
		return ""
	default:
		return "Using " + toolName
	}
}

type PermissionLevel string

const (
	PermReadOnly  PermissionLevel = "read-only"
	PermEditFiles PermissionLevel = "edit-files"
	PermFull      PermissionLevel = "full"
)

// permissionArgs returns the CLI flags that encode the given permission level.
func permissionArgs(level PermissionLevel) []string {
	switch level {
	case PermEditFiles:
		return []string{"--permission-mode", "acceptEdits"}
	case PermFull:
		return []string{"--permission-mode", "bypassPermissions"}
	}
	return nil
}

// parseClaudeStream reads line-delimited stream-json from r, translates each
// line into a StreamEvent, and sends it on out. When sourceDir is non-empty it
// is stamped as the WorkingDir on any event that carries a session ID so the
// frontend can build a working `cd … && claude --resume …` command. The
// function returns when ctx is cancelled, r reaches EOF, or the reader errors.
// The caller is responsible for closing out.
func parseClaudeStream(ctx context.Context, r io.Reader, sourceDir string, out chan<- StreamEvent) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

	for scanner.Scan() {
		if ctx.Err() != nil {
			return
		}
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var raw map[string]any
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}

		evt := StreamEvent{}

		if t, ok := raw["type"].(string); ok {
			evt.Type = t
		}

		// The init/system frame carries the session ID. Emit it so the UI can
		// show a resume hint as soon as possible.
		if evt.Type == "system" {
			if sid, ok := raw["session_id"].(string); ok {
				evt.SessionID = sid
				if sourceDir != "" {
					evt.WorkingDir = sourceDir
				}
				select {
				case out <- evt:
				case <-ctx.Done():
					return
				}
			}
			continue
		}

		// Extract text content and tool use from assistant messages.
		if evt.Type == "assistant" {
			if msg, ok := raw["message"].(map[string]any); ok {
				if content, ok := msg["content"].([]any); ok {
					var texts []string
					var activities []string
					for _, c := range content {
						if block, ok := c.(map[string]any); ok {
							if block["type"] == "text" {
								if text, ok := block["text"].(string); ok {
									texts = append(texts, text)
								}
							}
							if block["type"] == "tool_use" {
								name, _ := block["name"].(string)
								input, _ := block["input"].(map[string]any)
								activity := formatActivity(name, input)
								if activity != "" {
									activities = append(activities, activity)
								}
							}
						}
					}
					evt.Content = strings.Join(texts, "")
					evt.Activity = strings.Join(activities, ", ")
				}
			}
		}

		// The result frame is emitted at the end of a turn and carries the
		// final assistant text plus the (potentially updated) session ID.
		if evt.Type == "result" {
			if result, ok := raw["result"].(string); ok {
				evt.Content = result
			}
			if sid, ok := raw["session_id"].(string); ok {
				evt.SessionID = sid
				if sourceDir != "" {
					evt.WorkingDir = sourceDir
				}
			}
		}

		if evt.Type == "error" {
			if errMsg, ok := raw["error"].(string); ok {
				evt.Error = errMsg
			}
		}

		// Always forward `result` events (even without content) so downstream
		// consumers can use them as end-of-turn markers. Drop purely empty
		// non-result frames.
		if evt.Type == "result" || evt.Content != "" || evt.Error != "" || evt.Activity != "" {
			select {
			case out <- evt:
			case <-ctx.Done():
				return
			}
		}
	}
}

// RunAnalysis spawns claude CLI one-shot with the given prompt and returns an
// event channel that closes when the CLI exits. If sessionID is provided, it
// resumes that session instead of starting a new one.
//
// This path is kept for the GitHub Copilot provider (dispatch lives in
// provider.go) and as a fall-back when the installed Claude Code is too old to
// support the streaming-input ClaudeSession path.
func RunAnalysis(ctx context.Context, sourceDir, prompt, sessionID string, permLevel PermissionLevel, model ...string) (<-chan StreamEvent, error) {
	args := []string{"-p", prompt, "--output-format", "stream-json", "--verbose"}
	if sessionID != "" {
		args = []string{"-p", prompt, "--resume", sessionID, "--output-format", "stream-json", "--verbose"}
	}
	args = append(args, permissionArgs(permLevel)...)
	if len(model) > 0 && model[0] != "" {
		args = append(args, "--model", model[0])
	}

	cmd := exec.CommandContext(ctx, "claude", args...)
	if sourceDir != "" {
		cmd.Dir = sourceDir
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start claude: %w", err)
	}

	go drainToLog(stderr, "claude stderr")

	ch := make(chan StreamEvent, 64)
	go func() {
		defer close(ch)
		defer cmd.Wait()
		parseClaudeStream(ctx, stdout, sourceDir, ch)
	}()

	return ch, nil
}

func drainToLog(r io.Reader, tag string) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		logger.Debug(tag, "line", scanner.Text())
	}
}
