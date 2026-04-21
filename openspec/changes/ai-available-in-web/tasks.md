## 1. Extract AnalysisService

- [x] 1.1 Create `internal/ai/service.go` with an `AnalysisService` type owning `analysisCancel`, `analysisSessionID`, and a `streams` map keyed by `streamId` with value `chan Event`.
- [x] 1.2 Move the body of `App.StartAnalysis`, `App.StartTraceAnalysis`, `App.FollowUpAnalysis`, `App.CancelAnalysis` into methods on `AnalysisService`. Methods return `(streamId string, events <-chan Event, err error)` for start/follow-up.
- [x] 1.3 Wire the single instance from `App` so existing Wails callers stay intact. The service is also constructible by the HTTP handler (pass from `App` or share via a package-level getter). _(Each host constructs its own `AnalysisService`; the Wails app passes an `appTraceLoader`, the HTTP handler passes a `handlerTraceLoader`.)_
- [x] 1.4 Wails adapter in `app.go`: each AI method calls the service, then runs a goroutine that consumes the event channel and calls `wailsRuntime.EventsEmit(a.ctx, "ai:event" / "ai:done", evt)` — behavior identical to today.
- [x] 1.5 Verify Wails desktop build still compiles. _(`go build ./...` passes.)_

## 2. HTTP AI endpoints

- [x] 2.1 Add routes in `internal/api/handler.go`:
  - `GET  /api/ai/providers`
  - `POST /api/ai/analyze`
  - `POST /api/ai/trace-analyze`
  - `POST /api/ai/follow-up`
  - `POST /api/ai/cancel`
  - `GET  /api/ai/stream/{streamId}`
- [x] 2.2 Request body shapes mirror the existing Wails request structs — the types are now in `internal/ai` (`ai.AnalysisRequest`, `ai.TraceAnalysisRequest`, `ai.FollowUpRequest`) and reused by both adapters.
- [x] 2.3 Validate inputs: target must exist, target must have `SourceDir` set, mode must be known. `aiErrorStatus` maps service errors to `400` / `404` / `500`.
- [x] 2.4 On `POST /api/ai/analyze` / `trace-analyze` / `follow-up`: call the service (which generates the `streamId` internally and stores the channel in its `streams` map), return `202 Accepted` with `{ "streamId": "..." }`.
- [x] 2.5 Enforce single-active-analysis: the service's `startRun` cancels the prior run and closes its channel; any connected SSE reader receives `ai:done` and disconnects.

## 3. SSE streaming

- [x] 3.1 Implement `GET /api/ai/stream/{streamId}` handler with the required streaming headers.
- [x] 3.2 Look up the channel via `service.Subscribe(streamId)`; return `404` if unknown.
- [x] 3.3 Loop: read from the channel, write `event: ai:event\ndata: <json>\n\n`, call `http.Flusher.Flush`. On channel close or client disconnect, write `event: ai:done` frame and return.
- [x] 3.4 Heartbeat: `time.NewTicker(15s)` writes `: ping\n\n` while the stream is open.
- [x] 3.5 The service removes the stream entry when its goroutine finishes (in the `defer` inside `startRun`).

## 4. Frontend API layer

- [x] 4.1 In `frontend/src/api.ts`, add HTTP fallbacks for `checkClaudeAvailable`, `getAvailableAIProviders`, `startAnalysis`, `startTraceAnalysis`, `followUpAnalysis`, `cancelAnalysis`, plus `getSourceDir` / `setSourceDir`. Wails paths preserved.
- [x] 4.2 Added `subscribeAIEvents(streamId, onEvent, onDone)`: Wails mode → `EventsOn('ai:event' / 'ai:done')`; web mode → `EventSource` on `/api/ai/stream/{streamId}`. Returns a unified cleanup.
- [x] 4.3 `startAnalysis` / `startTraceAnalysis` / `followUpAnalysis` now return `{ streamId?: string }`; `ProfileViewer` and `TraceViewer` thread the `streamId` into the panel.

## 5. Frontend gating & panel

- [x] 5.1 In `frontend/src/components/AiAnalysisPanel.tsx`, dropped the `!isWails()` short-circuit and wired the effect to `subscribeAIEvents`.
- [x] 5.2 In `frontend/src/pages/ProfileViewer.tsx` and `frontend/src/components/TraceViewer/TraceViewer.tsx`, replaced the `isWails() && claudeAvailable` gate with `claudeAvailable` alone. `checkClaudeAvailable` in web mode uses `/api/ai/providers` to resolve capability. The flame-graph `onContextMenu` handler no longer requires Wails.
- [x] 5.3 Wails-only affordances (the native Browse button) stay behind `isWails()`.

## 6. Source-directory UI

- [x] 6.1 Source-dir input + `onBlur` save always render in `ConnectionDetail.tsx`; no `isWails()` gate.
- [x] 6.2 "Browse…" button rendered only when `isWails()`; click handler still calls `api.browseSourceDir()`.
- [x] 6.3 Help text in web mode reads: "Absolute path on the server's filesystem, e.g. /Users/you/projects/myrepo. Used by AI analysis to read source code."
- [x] 6.4 No HTTP endpoint for directory browsing was added. Source dir is set via `PUT /api/targets/{id}/source-dir` with the path in the JSON body.

## 7. Verification

- [x] 7.1 `go build ./...` passes.
- [ ] 7.2 Build the Wails app and smoke-test: provider list, start analysis, follow-up, cancel, Browse button — all unchanged. _(requires user verification)_
- [ ] 7.3 Run the web server and, in a browser, smoke-test: provider list loads over HTTP, AI panel appears with a source dir set, analysis starts and streams events via SSE, follow-up works, cancel works, no Browse button is shown. _(requires user verification)_
- [ ] 7.4 Kill the SSE connection mid-stream and verify the server cleans up (no goroutine leak: check `/debug/pprof/goroutine` count before/after). _(requires user verification)_
- [ ] 7.5 Manually test the "start overrides active" behavior by triggering two analyses in quick succession — the first stream should receive `ai:done` and the second should proceed. _(requires user verification)_
