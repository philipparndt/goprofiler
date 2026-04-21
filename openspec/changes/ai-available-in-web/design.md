## Context

`app.go` defines AI methods (`CheckClaudeAvailable`, `GetAvailableAIProviders`, `StartAnalysis`, `StartTraceAnalysis`, `FollowUpAnalysis`, `CancelAnalysis`) that are bound into the Wails JavaScript runtime and publish streaming results via `wailsRuntime.EventsEmit(a.ctx, "ai:event", ...)`. The web-server build (`internal/api/handler.go`) exposes no `/api/ai/*` routes.

On the frontend, `src/api.ts#isWails()` returns `!!(window as any).go`. `AiAnalysisPanel.tsx` short-circuits on `!isWails()`, and `ProfileViewer.tsx` / `ConnectionDetail.tsx` hide the AI button and source-dir controls behind the same gate. The native directory picker (`BrowseSourceDir`) calls `wailsRuntime.OpenDirectoryDialog`, which has no browser equivalent for arbitrary filesystem paths.

Constraints:
- The `internal/ai` package (Claude/Copilot CLI runners) is transport-agnostic — it already returns a Go channel of events, so plugging it into either Wails events or SSE is straightforward.
- Wails desktop builds must continue to work exactly as today (no regressions for current users).
- Single analysis at a time is already the model (`a.analysisCancel`, `a.analysisSessionID` on `App`).

## Goals / Non-Goals

**Goals:**
- AI features usable in web-server mode with the same UX as desktop, minus the native file picker.
- One backend path for AI: both transports call the same core code; no duplicated prompt-building or session-handling logic.
- Web mode gets a usable source-directory input (text entry) with the same validation as Wails mode.
- Capability-driven frontend gating: the AI UI renders when the provider is available and a source dir is set, regardless of runtime.

**Non-Goals:**
- Server-side sandbox for the AI CLI. The existing `PermissionLevel` model is unchanged.
- Multi-tenant / multi-user concerns. Web mode still assumes a single local operator; no auth added by this change.
- Browser-based directory picker (`showDirectoryPicker`) — the path-string input is sufficient and avoids surprise about where paths resolve (server filesystem, not browser filesystem).
- Changing the AI provider selection or switching providers.

## Decisions

### 1. Transport: SSE for streaming, JSON for request/response

AI events are strictly server-pushed, relatively small, text-ish, and one-directional — classic SSE territory. Alternative considered: WebSocket. Rejected because SSE is simpler to implement in Go (just `http.Flusher`), auto-reconnects in the browser, and we don't need client→server frames mid-stream (follow-up is a separate POST).

- `POST /api/ai/analyze` → `202 Accepted`, body `{ "streamId": "..." }`
- `POST /api/ai/follow-up` → `202 Accepted`, same shape
- `POST /api/ai/trace-analyze` → `202 Accepted`, same shape
- `POST /api/ai/cancel` → `204 No Content`
- `GET  /api/ai/stream/{streamId}` → SSE with events `event: ai:event` and `event: ai:done`
- `GET  /api/ai/providers` → list with availability flags (same shape as `GetAvailableAIProviders`)
- `GET  /api/ai/provider/current` → `{ "id": "claude" | "gh-copilot", "available": bool }`

The `streamId` is a random token issued when analysis starts so the SSE GET can be a simple cacheable-looking URL without a body, and so a stream can reconnect using the same ID after a transient network blip.

### 2. Refactor: extract `AnalysisService` from `App`

Move the body of `StartAnalysis`, `StartTraceAnalysis`, `FollowUpAnalysis`, `CancelAnalysis` into a new type in `internal/ai` (e.g. `ai.AnalysisService`) that owns the single-active-analysis state and returns the event channel. Both `app.go` (Wails) and `handler.go` (HTTP) become thin adapters:

- Wails: subscribe to the channel, call `EventsEmit("ai:event", ...)` / `EventsEmit("ai:done", ...)` as today.
- HTTP: register the stream by ID, fan out channel to any connected SSE client(s).

Rationale: without this refactor we'd either duplicate the prompt selection + session bookkeeping, or call Wails bindings from the HTTP path (which requires the Wails context, which web mode doesn't have). The refactor is small — each method is ~40 lines — and lands all logic in `internal/ai` where the rest of the provider code already lives.

### 3. Source directory: split the UI, keep the Go method Wails-only

`BrowseSourceDir` remains a Wails-only binding — the web path does **not** add an HTTP endpoint for it. The frontend renders:

- Always: a text input bound to `target.sourceDir` with a "Save" action and validation (path must be non-empty; format guidance in help text).
- When `isWails()`: an adjacent "Browse…" button that opens the native picker and writes the result into the same input.

Rationale: a "browse filesystem of the server host via HTTP" endpoint is a security footgun (directory traversal, information disclosure) for zero user benefit over pasting a path.

### 4. Frontend gating: capability, not runtime

Replace the `isWails()` gate on the AI surface with:

```ts
const aiAvailable = providers.some(p => p.id === currentProvider && p.available);
const canAnalyze = aiAvailable && !!target.sourceDir;
```

`isWails()` stays in the code but is now only consulted for runtime-specific affordances (Browse button, Wails event subscription path).

### 5. Event subscription in the panel

`AiAnalysisPanel.tsx` picks its event source at mount:

- Wails runtime present: keep the existing `EventsOn("ai:event", ...)` / `EventsOn("ai:done", ...)` path.
- Otherwise: open an `EventSource` at `/api/ai/stream/{streamId}`. The `streamId` is returned from the `start`/`follow-up` call and plumbed through panel state.

Both paths push into the same reducer that the component already uses — no UI logic duplication.

### 6. Session handling across transports

`analysisSessionID` moves onto `AnalysisService` and is returned as part of events, as today. Follow-up in web mode sends the session ID in the POST body; Wails mode keeps using the server-side state. (We could unify to "always pass session ID from the client" but that's out of scope and a bigger refactor.)

## Risks / Trade-offs

- [Bypassing the native picker frustrates users who don't know their source path] → Help text under the input with an example (`/Users/you/projects/myrepo`) and a link to docs; Wails users get the button unchanged.
- [SSE keep-alive behavior differs across reverse proxies] → Send a heartbeat comment (`: ping\n\n`) every ~15 s; document the `Cache-Control: no-transform` / `X-Accel-Buffering: no` headers needed for nginx.
- [Exposing AI endpoints from the HTTP server widens the attack surface on a machine that may not have been used with AI before] → AI endpoints only actually do anything when the CLI is installed and a source dir is set for the target; by default they're inert. No AI change is made to the default web-server binding (`localhost` only, as today).
- [Refactor into `AnalysisService` touches hot paths] → Keep the refactor mechanical (move methods, don't rename behaviors); add a smoke test that boots the HTTP server and hits `/api/ai/providers`.
- [Concurrent analyses from two tabs in web mode] → Mirror the desktop behavior: single-active analysis per server. A new `StartAnalysis` cancels the prior one; the SSE stream for the canceled run receives `ai:done` with a cancellation marker.
