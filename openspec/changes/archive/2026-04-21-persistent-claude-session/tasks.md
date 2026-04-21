## 1. Parser extraction

- [x] 1.1 Factored the stream-json parser out of `RunAnalysis` into a shared helper `parseClaudeStream(ctx, r, sourceDir, out)` in `internal/ai/claude.go`. The helper stamps `WorkingDir` on session-ID-bearing events so every path (one-shot and persistent) gets the `cd … && claude --resume …` helper for free.
- [x] 1.2 `RunAnalysis` is now a thin wrapper over the helper. Behavior for one-shot Claude and for the Copilot path is unchanged.

## 2. ClaudeSession type

- [x] 2.1 Added `internal/ai/session.go` with `ClaudeSession` plus `ErrSessionUnsupported` / `ErrSessionClosed` sentinels.
- [x] 2.2 `StartClaudeSession` spawns `claude --print --input-format stream-json --output-format stream-json --verbose [--permission-mode …]` in `sourceDir`, wires a parser goroutine on stdout (via the shared helper), a tail-buffered stderr sink for crash diagnostics, and a waiter goroutine that closes the events channel on CLI exit.
- [x] 2.3 `Send(message)` writes a JSON-framed user envelope (`{"type":"user","message":{"role":"user","content":[{"type":"text","text":…}]}}`) + newline to the session's stdin under the session mutex; returns `ErrSessionClosed` if the process already exited.
- [x] 2.4 `Events()` exposes the read side of the events channel; `SourceDir()` / `PermLevel()` / `Closed()` expose state the service needs to decide whether to reuse a session.
- [x] 2.5 `Close()` closes stdin, cancels the ctx (killing the process), and blocks until the waiter goroutine exits — so a follow-up Close is a no-op and a subsequent StartClaudeSession doesn't race the teardown.

## 3. Version / feature detection

- [x] 3.1 The session constructor watches its waiter channel before returning; if the process exited almost immediately with "unknown option `--input-format`"-style stderr, it returns `ErrSessionUnsupported`.
- [x] 3.2 `AnalysisService.startFresh` catches `ErrSessionUnsupported`, sets `sessionUnsupported = true` (sticky for the service lifetime), logs a warning, and falls back to the one-shot path. Subsequent calls short-circuit past the session attempt.

## 4. AnalysisService wiring

- [x] 4.1 Added `session *ClaudeSession`, `currentOut`, `currentStreamID`, `oneShotCancel`, and `sessionUnsupported` fields to `AnalysisService`, all guarded by the existing mutex.
- [x] 4.2 New control flow:
  - `StartAnalysis` / `StartTraceAnalysis` → `startFresh`, which `Cancel()`s any prior run and, for the Claude provider, calls `startClaudeSession` (which spawns + registers the first turn). Falls back to `runOneShotTurn` when needed.
  - `FollowUp` → `followUpOnSession` for Claude (reuses or respawns), or `runOneShotTurn` for Copilot / fall-back.
  - `runOneShotTurn` is the lifted version of the old `startRun`, used only for Copilot and the unsupported-CLI fall-back.
- [x] 4.3 `FollowUp` for Claude errors with "no active analysis to follow up on" when the session is nil or closed.
- [x] 4.4 `startFresh` always tears down the prior session before spawning the new one — matches the spec's "starting a new analysis terminates any prior session" requirement.
- [x] 4.5 `Cancel` closes the Claude session (which triggers the forwarder to terminate the current per-turn channel with a proper `ai:done`) and cancels the one-shot context, if any.

## 5. Turn boundaries on the events channel

- [x] 5.1 `sessionForwarder` runs once per session. It reads `session.Events()`, forwards each event to whichever per-turn channel is currently registered in `s.currentOut`, and closes the per-turn channel plus removes its `streamID` entry on a `Type == "result"` event. Next turn creates a fresh channel via `attachTurn`.
- [x] 5.2 On session exit (graceful or crash), the forwarder closes any still-attached per-turn channel so the panel always sees a terminal `ai:done`. CLI crashes surface as a synthetic `{Type:"error", Error: …}` frame before the channel closes.

## 6. Copilot path untouched

- [x] 6.1 `runOneShotTurn` dispatches via the existing `RunWithProvider` helper. For `ProviderCopilot` it goes through the untouched `runCopilot` path. No behavior change for Copilot users.

## 7. Verification

- [x] 7.1 `go build ./...` passes. `go vet ./...` reports only a pre-existing warning in `internal/java/connection.go` unrelated to this change.
- [ ] 7.2 Manual, Claude provider: start an analysis, wait for the first response, send a follow-up, observe that the latency between sending and receiving the first `activity`/content event is substantially lower than before (target: under 2 seconds on a warm machine). _(requires user verification)_
- [ ] 7.3 Manual: cancel mid-response, then start a new analysis — the new one spawns a fresh process and works. _(requires user verification)_
- [ ] 7.4 Manual: change the target's source directory between turns — the next turn should respawn (grep `~/.goprofiler/app.log` for "claude session being respawned"). _(requires user verification)_
- [ ] 7.5 Manual: `pkill claude` while the panel is open — panel should unblock with an error rather than hanging. _(requires user verification)_
- [ ] 7.6 Manual, older CLI (if available): install a Claude Code version without `--input-format stream-json` and confirm the fallback kicks in (log: "claude CLI too old for streaming input"). _(requires user verification)_
