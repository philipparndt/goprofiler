## Why

Today, if a user clicks **Explain** on a target with no source directory configured, the AI panel opens with only a text instruction: "Go to the target's Info tab, set the Source Directory, come back here, try again." That's a four-step detour (close panel → navigate → edit → re-click). Users routinely abandon the AI feature the first time this happens because the path of least resistance is just not using it. The source dir is a one-field input — there's no reason it can't be captured right where the user already is.

## What Changes

- When the AI panel opens and the analysis fails with a "no source directory configured" error, the panel SHALL render an inline source-directory form instead of the current text instruction. The form has: a single text input prefilled with the target's current value (usually empty), a "Browse…" button in Wails mode only, and a "Save & Start" action.
- Pressing **Save & Start** saves the path against the target via the existing `setSourceDir` API and then immediately retries the original analysis request that triggered the error. No panel close, no tab switch, no duplicate click.
- In browser/web mode the panel shows the same inline help text currently used on the Info tab (absolute path on the server's filesystem, example).
- The existing error rendering for unrelated errors is unchanged. Only the "source directory" case is intercepted.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `ai-analysis`: the analysis UI SHALL offer in-panel source-directory configuration when the analysis cannot start because no source directory is set, and SHALL automatically retry the original request after the directory is saved.

## Impact

- Frontend only: `frontend/src/components/AiAnalysisPanel.tsx` gains two new props (`targetId` and `onRetry`) and a new render branch for the source-dir setup; `frontend/src/pages/ProfileViewer.tsx` and `frontend/src/components/TraceViewer/TraceViewer.tsx` pass both props and implement a retry handler that re-fires the last analysis request.
- No backend changes. `api.setSourceDir` already works from web (PUT `/api/targets/{id}/source-dir`) and Wails.
- No new dependencies.
