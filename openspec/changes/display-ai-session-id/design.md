## Context

The AI analysis panel already subscribes to events via `subscribeAIEvents(streamId, onEvent, onDone)`. Each `StreamEvent` (shape in `internal/ai/claude.go`) carries a `SessionID` field which the backend updates every time Claude emits one. The service also uses the latest session ID to pass `--resume` into follow-up runs. So the server side is already session-aware; only the rendering is missing.

The current provider switching logic lives in the settings store (`aiProvider = "claude" | "gh-copilot"`). `gh copilot` doesn't emit a session ID — its StreamEvents will have an empty `SessionID`.

## Goals / Non-Goals

**Goals:**
- Show the live session ID in the AI panel header once it's available.
- Offer a one-click copy that puts the full ID on the clipboard.
- For the `claude` provider, show the exact terminal command (`claude --resume <id>`) so a user can take over without having to look up the flag.
- Keep the existing streaming UX unchanged — no new panes, no layout churn.

**Non-Goals:**
- Accepting a user-supplied session ID to attach to in the UI (that's a bigger feature — manual attach / detach).
- Persisting the session ID across page reloads (the session lives as long as the provider process is alive — if the panel is dismissed or the backend restarts, the session is gone on the Claude side too).
- Changing how follow-ups work. The backend already passes the tracked session ID.

## Decisions

### 1. Panel-local state, sourced from the event stream

Keep a `useState<string | undefined>(undefined)` for the session ID in `AiAnalysisPanel`. The existing event-consumer updates it whenever `evt.sessionId` is non-empty. Rationale: it avoids threading session-ID state through parents (`ProfileViewer`, `TraceViewer`) and avoids a new server endpoint. The event stream is already the source of truth.

### 2. Display in the panel header, not the body

Render the ID in the same header row that already holds "AI Analysis", the loading dot, and the action buttons — a compact inline chip. The body stays for markdown output. Alternative considered: showing it as a subtle footer. Rejected because users will want to grab the ID while scrolled deep into long output, and headers stay pinned (the current layout already keeps the header fixed via `flexShrink: 0`).

### 3. Truncation + tooltip + copy button

IDs are ~36-char UUIDs — too long to sit comfortably in a crowded header. Render first 8 chars + `…` (monospaced) with a native `title` tooltip containing the full ID, and a small "Copy" button next to it. `navigator.clipboard.writeText` is already used elsewhere in the panel (the "Copy All" button) so the pattern is consistent.

### 4. Provider-aware hint

If the session ID is present and the current AI provider is `claude`, render a small help chip showing `claude --resume <first-8-chars>…` with a tooltip giving the full command. If the provider is not `claude`, just show the raw ID without the hint (Copilot session-continuation is not a first-class concept today). The provider comes from `api.getAvailableAIProviders()` or the existing settings fetch — reuse whichever is already loaded into the panel's parent; if neither is handy, keep it simple and always show the raw ID plus a generic "Session" label.

### 5. Reset on panel open

When the user opens the panel for a fresh analysis, clear the stored session ID (the existing `visible` effect already resets `content`, `loading`, `activity`). Piggyback on it so the old session ID doesn't linger across runs.

## Risks / Trade-offs

- [Session ID leaks into screenshots/logs] → Session IDs from Claude Code are effectively opaque correlators; they don't grant access. Treating them as non-secret is consistent with how the CLI itself echoes them. Acceptable.
- [No ID visible for Copilot runs] → Intentional; Copilot doesn't produce one. The slot simply stays empty. Acceptable.
- [User copies ID but the provider session has already expired on the backend] → Not our concern to solve; `claude --resume` will emit its own error. We don't need to probe session liveness.
