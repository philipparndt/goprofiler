## Context

Current flow (`internal/ai/claude.go:RunAnalysis`):

1. `exec.CommandContext(ctx, "claude", "-p", prompt, "--output-format", "stream-json", "--verbose", ...)` spawns the CLI.
2. Stdout is parsed line-by-line into `StreamEvent`s delivered over a channel.
3. Channel closes when the process exits.
4. Follow-up calls build a new `exec.Cmd` with `--resume <id>` and repeat steps 1–3.

`AnalysisService` (`internal/ai/service.go`) invokes `RunAnalysis` (or `RunWithProvider` for the multi-provider dispatch). Each turn is a full spawn/exit cycle.

Claude Code supports `--input-format stream-json` which, when combined with `-p --output-format stream-json --verbose`, keeps the process alive and reads JSON-framed user messages from stdin as they arrive. The documented input shape is a line-delimited JSON stream; each line is a single message envelope.

`gh copilot` has no equivalent and is stateless per invocation.

## Goals / Non-Goals

**Goals:**
- Eliminate CLI boot latency on follow-up turns for the Claude provider.
- Keep the existing single-active-analysis semantic: starting a new analysis cancels any prior session.
- Preserve the session-ID and working-dir event fields that the panel already consumes.
- Surface CLI crashes cleanly (typed error event, panel unblocks).

**Non-Goals:**
- Pre-warming the Claude process before the user first clicks Explain.
- Caching prompts or profile payloads server-side. We still send the full prompt on the first turn; the win comes from not paying CLI boot cost twice.
- Replacing Claude Code with the Anthropic SDK. That's a much larger rewrite and loses the agent loop; tracked separately.
- Supporting persistent sessions for `gh copilot`. The shape doesn't fit and it's a secondary provider.
- Multi-session parallelism. The service still serves one analysis at a time.

## Decisions

### 1. New type: `ClaudeSession`

Encapsulates one long-running `claude` process. Roughly:

```go
type ClaudeSession struct {
    cmd     *exec.Cmd
    stdin   io.WriteCloser
    events  chan StreamEvent
    ctx     context.Context
    cancel  context.CancelFunc
    srcDir  string
    permLvl PermissionLevel
    mu      sync.Mutex
    closed  bool
}

func StartClaudeSession(ctx context.Context, sourceDir string, permLvl PermissionLevel) (*ClaudeSession, error)
func (s *ClaudeSession) Send(message string) error
func (s *ClaudeSession) Events() <-chan StreamEvent
func (s *ClaudeSession) Close()
```

The constructor spawns `claude -p --input-format stream-json --output-format stream-json --verbose` (plus `--permission-mode …` based on `permLvl`) with `cmd.Dir = sourceDir`. Stdout is parsed exactly like `RunAnalysis` does today — the existing parser is lifted into a helper that both call.

`Send(message)` JSON-encodes a user message envelope (`{"type":"user","message":{"role":"user","content":[{"type":"text","text":"…"}]}}`) and writes it (plus a trailing newline) to `stdin`. Writes are serialized by `mu` to avoid interleaving if the frontend double-clicks.

`Events()` returns the read side of the event channel. Closed when the process exits for any reason.

`Close()` calls `stdin.Close()`, then `cancel()` (which kills the process via `exec.CommandContext` ctx), then drains/awaits the reader goroutine.

### 2. Service integration

`AnalysisService` gains a field `session *ClaudeSession` (protected by the existing `mu`).

- `StartAnalysis` / `StartTraceAnalysis` (Claude provider): close any existing session, create a new `ClaudeSession`, assign to `s.session`, then `Send(prompt)`. The returned stream ID + channel pair comes from the new session, wrapped by the existing `streams` bookkeeping so the HTTP and Wails adapters don't change.
- `FollowUp` (Claude provider): if `s.session` is nil **or** its context is done, fail with a descriptive error ("no active session"). Otherwise just `Send(req.Message)` and return the same stream ID the current session was registered under.
- `Cancel`: close the session (which closes its events channel, which causes the adapter's `for evt := range` loop to exit, which emits `ai:done`).

For the `gh copilot` provider, keep the old one-shot `runCopilot` path.

### 3. Event loop and streamId reuse

Today each run generates a fresh `streamId`, stores the channel in `s.streams[streamId]`, and the HTTP handler's SSE endpoint subscribes by `streamId`. With a persistent session, the Claude events channel lives longer than any one "start" call, but the panel still expects a fresh `streamId` per start/follow-up call so it can swap its SSE subscription.

Resolution: on every `StartAnalysis` / `FollowUp` we register the **same** underlying session events channel under a new `streamId`, fan out via a small per-call relay goroutine. This is cheap: one goroutine per turn that forwards events until the panel unsubscribes or the session ends. It keeps the HTTP + Wails adapters untouched.

Alternative considered: have the panel subscribe to one long-lived stream for the whole session. Rejected because it would require API changes (the panel tracks a single `streamId` per analysis context today), and because the fan-out goroutine is near-free.

### 4. Detecting and reporting CLI death

Three failure modes to handle:

- **Clean exit**: process terminates with code 0 after its current turn, stdin still open. This happens if the CLI decides it's done (unlikely in stream-json input mode but possible). Treat as session-ended; the next `Send` fails with "session closed".
- **Crash / non-zero exit**: capture exit status + stderr tail, emit a synthetic `StreamEvent{Type: "error", Error: "…"}` on the events channel, then close. The panel's existing error-handling code unblocks the UI.
- **Orphaned**: cancelled `ctx` (e.g. `Cancel()` called). Kill signal propagates; no event is emitted because the user asked for it.

A small reader goroutine (similar to today's stderr-to-log loop) handles the death detection.

### 5. Source-directory and permission-level changes

If a user sets a different source directory between turns, or changes the permission level, the existing session is invalid (process is rooted in the old CWD with the old permission mode). On `Send`, the service compares the new request's `sourceDir` / `permLvl` against the session's stored values; on mismatch, close the session and start fresh (which means that follow-up pays the cold-start cost — the first cold start that round). This is rare and acceptable.

### 6. Initial prompt

Claude's `-p` flag in combination with `--input-format stream-json` is documented to work; on some CLI versions `-p` may require a dummy value. During implementation we pick the working form (likely `-p ""` or simply `--input-format stream-json` without `-p`) via a one-off test. Either way, the first prompt is sent via `Send(initialPrompt)` immediately after spawn, not via the command line, so it arrives inside the stream-json protocol and benefits from `--include-partial-messages` if we enable it later.

## Risks / Trade-offs

- **CLI version compatibility** — `--input-format stream-json` is a Claude Code 1.x+ feature. If a user has an older CLI, spawn will fail. → Detect this at `StartClaudeSession` time (look for a specific error message from the CLI) and fall back to the old per-turn `RunAnalysis` path. Log the fallback once.
- **Stuck process** — the CLI could hang on a tool call and never emit more events. Cancel already handles this (ctx.Cancel → kill). No new risk, same as today.
- **Stdout parser drift** — the stream-json format from the CLI may change across Claude Code versions. We already depend on it via `RunAnalysis`; the persistent variant inherits that exposure. → Keep the parser in one place (shared helper) so a future format change is a single-file edit.
- **Memory growth in long sessions** — a long-running `claude` process accumulates conversation context. Unavoidable; acceptable given the session dies when the panel closes or the user cancels.
- **Harder to debug than per-turn spawn** — with a persistent process, a bug in message framing means every subsequent turn breaks silently. → Log every outgoing message at `debug` level (via the existing `go-logger` that already captures to `~/.goprofiler/app.log`). Frontend logFrontend path already captures any client-side rejection.
