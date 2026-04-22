## 1. Panel: props + detection

- [x] 1.1 Added optional `targetId?: string` and `onRetry?: () => void` to `AiAnalysisPanelProps`.
- [x] 1.2 `needsSourceDir = !!error && error.includes("source directory") && !!targetId && !!onRetry` branches the render.

## 2. Panel: source-dir form

- [x] 2.1 New `SourceDirSetupForm` component defined inline in `AiAnalysisPanel.tsx`. Rendered in the content area instead of the markdown error block when `needsSourceDir` is true.
- [x] 2.2 Local state: `path`, `saving`, `saveError`.
- [x] 2.3 Layout: title "Source directory required", short explanation, text input, Wails-only "Browse…" button, help text (in web mode), inline save-error banner, "Save & Start" primary action disabled when `path.trim() === ""` or `saving`.
- [x] 2.4 Submit flow: `setSourceDir(targetId, path.trim())`, then `onSaved()` (which parents wire to `lastAnalysisRunRef.current?.()`); on failure `saveError` is set and the form stays visible.
- [x] 2.5 Browse button awaits `api.browseSourceDir()` and writes the result into the input without auto-saving.

## 3. Panel: styling + accessibility

- [x] 3.1 Only existing CSS tokens used.
- [x] 3.2 Input has `aria-label="Source directory path"`; error banner has `role="alert"`.
- [x] 3.3 Enter in the input submits (via `onKeyDown`).

## 4. ProfileViewer wiring

- [x] 4.1 Added `const lastAnalysisRunRef = useRef<(() => Promise<void>) | null>(null)`.
- [x] 4.2 Wrapped the Explain button, Optimize button, context-menu Explain-function, and `onFollowUp` in small `run = async () => {...}` closures; each assigns itself to `lastAnalysisRunRef.current` before calling.
- [x] 4.3 `<AiAnalysisPanel>` now receives `targetId={profile?.targetURL}` and `onRetry={() => lastAnalysisRunRef.current?.()}`.

## 5. TraceViewer wiring

- [x] 5.1 Same ref pattern applied to `triggerTraceAi` and the trace-viewer `onFollowUp`.
- [x] 5.2 `<AiAnalysisPanel>` receives `targetId={targetUrl}` and the matching `onRetry`.

## 6. Fallback preservation

- [x] 6.1 The `needsSourceDir` guard requires BOTH `targetId` and `onRetry` to be set; any caller that omits either falls back to the original markdown error.

## 7. Verification

- [x] 7.1 `cd frontend && npm run build` passes. `npm run lint` introduces no new errors on the touched files (same count as baseline).
- [ ] 7.2 Manual, target without source dir: Explain opens the panel → inline form appears → enter path → Save & Start → panel transitions to loading and runs. _(requires user verification)_
- [ ] 7.3 Manual: save error (e.g. permissions) surfaces inline, form stays visible. _(requires user verification)_
- [ ] 7.4 Manual, Wails: Browse opens the native picker and populates the input. _(requires user verification)_
- [ ] 7.5 Manual: trigger a non-source-dir failure (CLI missing, etc.) — original error view renders, not the form. _(requires user verification)_
