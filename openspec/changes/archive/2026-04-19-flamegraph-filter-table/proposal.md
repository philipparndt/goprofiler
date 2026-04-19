## Why

When zooming into a subtree in the flame graph, the top functions table below continues to show all functions from the entire profile. This makes it hard to focus analysis on a specific code path — the table should reflect the same scope the user is looking at in the flame graph.

## What Changes

- Track the currently zoomed flame graph node in React state via a click handler on d3-flame-graph
- Filter the top functions table to only show functions present in the zoomed subtree
- Recompute flat/cumulative values relative to the zoomed subtree
- Reset the filter when zoom is reset

## Capabilities

### New Capabilities
- `flamegraph-table-sync`: Synchronize flame graph zoom state with the top functions table, filtering and recomputing values based on the selected subtree

### Modified Capabilities

## Impact

- **Frontend**: `ProfileViewer.tsx` — add zoom state tracking, filter logic, and pass filtered data to `TopFunctionsTable`
- No backend changes required — all filtering is computed client-side from the existing `FlameNode` tree
