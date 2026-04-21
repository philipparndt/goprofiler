## Why

Every AI action in GoProfiler today spawns a fresh `claude` CLI process: `StartAnalysis`, `StartTraceAnalysis`, and `FollowUpAnalysis` all call `exec.CommandContext("claude", …)` and wait for the whole process lifecycle. That means every turn pays for:

1. CLI boot (Node runtime, TS compile cache warm, tool registration) — multi-second even on a fast machine.
2. Authentication / API handshake with Anthropic.
3. On follow-ups: reading the session from disk via `--resume`, replaying the full message history, re-uploading any cached context.
4. Re-sending our own prompt (system prompt + profile payload + function list) with no reuse of prior processing.

Users notice this most on follow-ups — a chat that should feel conversational has a 5–15 second "ready" lag between messages. The heavy lifting is the process boot, not the model inference.

Claude Code 1.x+ supports `--input-format stream-json`, which keeps the CLI alive and accepts new user messages as JSON-framed lines on stdin, while continuing to emit stream-json events on stdout. This lets one process handle the whole conversation.

## What Changes

- Introduce a persistent `ClaudeSession` in `internal/ai`: one `claude -p … --input-format stream-json --output-format stream-json --verbose` process per analysis, spawned on first use and reused for every follow-up.
- The `AnalysisService` owns the current session. `StartAnalysis` / `StartTraceAnalysis` close any prior session and start a new one (matching today's single-active-analysis semantics). `FollowUpAnalysis` writes the user message to the live session's stdin — **no new process spawn**.
- Drop the `--resume` pathway for in-app follow-ups: the process is still alive, so there's nothing to resume. The session ID that claude emits (and that the panel displays) still works for out-of-band `claude --resume <id>` from a terminal — that behavior is unchanged.
- Process lifecycle: a session is torn down on explicit `Cancel`, on unexpected CLI exit (with an error event surfaced to the panel), and when the next `StartAnalysis` supersedes it. Panel close calls `Cancel`.
- GitHub Copilot (`gh copilot`) is untouched — it's a one-shot CLI with no persistent concept. Only the Claude provider gets the new path.
- **No UI changes.** The event shape (`StreamEvent`) stays the same. The panel doesn't know (or care) whether it's talking to a fresh process or a reused one.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `ai-analysis`: follow-up turns within a running analysis SHALL reuse the provider process rather than spawning a new one, so latency between turns is bounded by model inference rather than CLI boot.

## Impact

- Backend: new file `internal/ai/session.go` (or equivalent) with `ClaudeSession` type; refactor of `internal/ai/claude.go` and `internal/ai/service.go` to use it. `RunAnalysis` is either renamed or re-wrapped as a thin shim over the session.
- No frontend changes. No new API endpoints. No spec deltas for source-dir or streaming — those stay as they are.
- No new dependencies.
- Non-goals: switching to the Anthropic SDK, pre-warming the process before the user clicks Explain, replacing Claude Code's agent loop.
