## Why

The heap profile flame graph and call tree currently always show `inuse_space` (current live memory). While this is the most useful default, users sometimes need to see `alloc_space` (total cumulative allocations) in the flame graph to find allocation-heavy code paths -- even if those allocations are short-lived and don't show up in inuse.

The top functions table already shows both inuse and alloc columns, but the flame graph only visualizes inuse. Users need a toggle to switch the flame graph and call tree between inuse and alloc views.

## What Changes

- Add an "Inuse / Alloc" toggle for heap profiles that switches which value the flame graph and call tree visualize
- Backend: accept a `valueMode=alloc` query param on getProfile that selects `alloc_space` instead of `inuse_space` as the primary value index
- Frontend: toggle button in the toolbar, re-fetches profile data with the new mode

## Capabilities

### Modified Capabilities
- `flame-graph-visualization`: Add inuse/alloc toggle for heap profiles

## Impact

- **Modified**: Backend `getProfile` handler -- accept `valueMode` param, pass to flamegraph.Convert and calltree.BuildCallTree
- **Modified**: `internal/flamegraph/convert.go` -- accept optional value index override
- **Modified**: Frontend ProfileViewer -- add toggle, re-fetch on change
