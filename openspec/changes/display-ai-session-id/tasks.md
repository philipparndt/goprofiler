## 1. Session-ID state in the panel

- [x] 1.1 In `frontend/src/components/AiAnalysisPanel.tsx`, add `const [sessionId, setSessionId] = useState<string | undefined>(undefined)`.
- [x] 1.2 In the existing `subscribeAIEvents` consumer, when `evt.sessionId` is a non-empty string, call `setSessionId(evt.sessionId)`.
- [x] 1.3 Reset `sessionId` (and the session copy state) to their initial values in the `visible` reset effect.

## 2. Provider awareness

- [x] 2.1 In `AiAnalysisPanel`, add `const [provider, setProvider] = useState<string | undefined>(undefined)`.
- [x] 2.2 On panel open, call `api.getAvailableAIProviders()` and pick the entry where `active` is true (falling back to the first `available` one).
- [x] 2.3 Derive `showResume = provider === "claude"` in the `SessionIdChip` helper for render-time checks.

Backend support for this landed in `internal/ai/service.go` (new `ListProviders()` method that stamps the `active` flag based on settings) and both the Wails binding `App.GetAvailableAIProviders` and HTTP handler `GET /api/ai/providers` were refactored to call through the service, so both runtimes see the same shape.

## 3. Header rendering

- [x] 3.1 Session-ID chip renders in the left header block after the title/loading dot, only when `sessionId` is truthy.
- [x] 3.2 Chip shows `sessionId.slice(0, 8) + "…"` with a native `title={sessionId}` tooltip showing the full value.
- [x] 3.3 Inline "Copy" button writes the full `sessionId` to `navigator.clipboard` and flips to "Copied" / "Copy failed" for 1.5 s (via `sessionCopyState` + timeout effect).
- [x] 3.4 When the active provider is Claude, a second chip shows `claude --resume <8-char>…` with the full command in its tooltip.

## 4. Styling & layout

- [x] 4.1 Chips use existing CSS variables (`--bg-secondary`, `--border`, `--text-muted`, `--text-primary`, `--font-mono`). No new CSS files.
- [x] 4.2 Header left block uses `flex: 1`, `minWidth: 0`, `overflow: hidden` so chips truncate gracefully on narrow panels; right action block keeps `flexShrink: 0` so buttons never wrap.

## 5. Verification

- [x] 5.1 `go build ./...` and `cd frontend && npm run build` both pass. `npm run lint` reports no new errors on `AiAnalysisPanel.tsx` (same 3 pre-existing issues as baseline).
- [ ] 5.2 Manual (Wails + web): start an analysis, confirm the session-ID chip appears after the first event, tooltip shows the full ID, Copy writes the full ID to clipboard, and the `claude --resume …` helper is shown when the provider is Claude. _(requires user verification)_
- [ ] 5.3 Manual with Copilot provider (if configured): confirm no session chip renders and no error appears in `~/.goprofiler/app.log`. _(requires user verification)_
- [ ] 5.4 Manual: close and reopen the panel for a new analysis — the previous session ID must not linger before the first event arrives. _(requires user verification)_
