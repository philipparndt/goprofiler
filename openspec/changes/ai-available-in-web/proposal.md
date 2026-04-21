## Why

The AI analysis features (profile/trace explanation, optimization suggestions, follow-up chat) are currently only available when the app is built and run as a Wails desktop binary — in web-server mode the AI panel is hidden entirely. The underlying AI runtime (Claude / GitHub Copilot CLI) works identically in both modes; the only truly Wails-bound piece is the native "Browse…" directory picker used to choose a source-code directory. Today the frontend uses a single `isWails()` gate that blocks both, which unnecessarily hides AI from browser users. Web users can perfectly well type or paste a source-directory path.

## What Changes

- Expose the existing AI operations (`CheckClaudeAvailable`, `GetAvailableAIProviders`, `StartAnalysis`, `StartTraceAnalysis`, `FollowUpAnalysis`, `CancelAnalysis`) as HTTP endpoints under `/api/ai/*` so the browser can drive them.
- Stream AI events (`ai:event`, `ai:done`) over Server-Sent Events instead of (or in addition to) Wails event bus, so the browser receives the same incremental updates.
- In the frontend, replace the `isWails()` gate on AI UI with a capability check (AI provider availability + source directory set). AI panel becomes visible in both modes.
- Keep `BrowseSourceDir` Wails-only. In web mode, show a text input for the source-directory path with clear help text; hide the native "Browse…" button.
- Keep the Wails event path intact for the desktop build — it continues to work unchanged.

## Capabilities

### New Capabilities
- `ai-analysis`: AI-powered analysis of profile and trace data, available in both Wails desktop and browser/web-server modes, with transport-appropriate streaming and a source-directory picker that adapts to the runtime.

### Modified Capabilities
<!-- none — no prior specs exist -->

## Impact

- Backend: `internal/api/handler.go` gains new `/api/ai/*` routes and an SSE stream; `app.go` AI methods refactored so their core logic is reusable from both Wails bindings and HTTP handlers (extracting a transport-agnostic `AnalysisService` or similar).
- Frontend: `src/api.ts` adds HTTP + SSE fallbacks for AI methods; `src/components/AiAnalysisPanel.tsx` drops the `isWails()` short-circuit and subscribes to either Wails events or `EventSource`; `src/pages/ConnectionDetail.tsx` splits the source-dir UI so only the "Browse…" button is Wails-only.
- No new dependencies. No changes to the AI runtime (`internal/ai/*`).
