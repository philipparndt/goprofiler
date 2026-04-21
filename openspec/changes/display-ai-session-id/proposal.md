## Why

When the AI analysis panel is open, the underlying `claude` (or compatible) CLI session already has a stable session ID — it arrives on every `ai:event` as `evt.sessionId`, and the backend uses it to `--resume` follow-ups. The UI never shows it. This means a user who wants to take the conversation outside the GoProfiler UI — e.g. continue it in a terminal with `claude --resume <id>`, diff it, copy it into another tool, or hand it off to a teammate — has no way to obtain the ID. Surfacing the session ID unlocks every out-of-band workflow without any backend change.

## What Changes

- Capture the latest `sessionId` received on the AI event stream in the `AiAnalysisPanel` component.
- Render the session ID in the panel header as a short, monospaced string (truncated with a tooltip showing the full value) with a copy-to-clipboard button next to it.
- For the `claude` provider, show a small helper hint near the ID: `claude --resume <id>` so the user knows exactly how to take over.
- When no session ID is known yet (before the first event arrives, or when using a provider that doesn't emit one), render nothing in that slot — no placeholder noise.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `ai-analysis`: adds a requirement that the analysis UI SHALL surface the current provider session identifier so the user can resume the conversation out of band.

## Impact

- Frontend only: `frontend/src/components/AiAnalysisPanel.tsx` gains a session-ID state, header slot, and copy button.
- No backend changes — `SessionID` already rides the event stream (`internal/ai/claude.go`, `internal/ai/service.go`).
- No new dependencies.
