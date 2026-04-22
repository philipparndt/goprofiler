## Why

The AI analysis panel is a full-height sidebar that occupies ~520 px on the right. While the AI is working, the user often wants to keep glancing at flame graphs, call trees, or expvar — but the panel blocks half the viewport. Today the only way to get it out of the way is to click "Close", which cancels the run and clears the output. Users routinely lose work in progress this way and have to re-ask. They want a third option: **hide the panel without stopping the AI**, and come back to it later.

## What Changes

- Add a **collapse** control to the AI panel header (alongside "Copy All", "Cancel", "Close"). Clicking it minimizes the panel to a thin vertical strip on the right edge of the viewport.
- In the collapsed state, the strip shows a small pulse indicator while the analysis is running and a compact status label (e.g. `AI running…`, `AI ready`, `AI error`) plus an unread-badge-style marker when the run has completed or errored while collapsed. Clicking the strip re-expands the panel.
- **The analysis continues while collapsed.** The panel component stays mounted, its event subscription stays live, incoming events continue to accumulate into `content`/`activity`/`sessionId`. When the user re-expands, they see the current state — mid-stream text, completed output, or an error — as if the panel was never hidden.
- "Close" keeps its current meaning (cancel + clear + unmount the panel). "Cancel" keeps its meaning (stop the run, leave the panel open with whatever was streamed so far). Only "Collapse" is new.
- The collapsed/expanded state is local to the page — navigating away from the Profile Viewer / Trace Viewer still unmounts the panel as today.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `ai-analysis`: the analysis UI SHALL support collapsing the panel to a thin strip without interrupting the active analysis, and the run SHALL continue to receive events while the panel is collapsed.

## Impact

- Frontend only: `frontend/src/components/AiAnalysisPanel.tsx` adds a `collapsed` state, a collapse/expand toggle, and a collapsed-strip render path. No changes to parents (`ProfileViewer`, `TraceViewer`).
- No backend changes. The backend is already decoupled from the panel — the persistent Claude session keeps running regardless of whether the panel renders the expanded or collapsed view.
- No new dependencies.
