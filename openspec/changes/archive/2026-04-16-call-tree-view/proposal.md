## Why

Flame graphs are great for spotting hot paths at a glance, but they flatten the call hierarchy and don't show invocation counts. A call tree view shows the full caller/callee hierarchy with per-function metrics (self time, cumulative time, call count), making it easy to understand _how_ functions are called and how often. This is a core feature of tools like JProfiler and IntelliJ Profiler.

## What Changes

- Add a call tree tab to the profile viewer, alongside the existing flame graph
- Backend generates a call tree structure from pprof data with aggregated invocation counts per function
- Frontend renders an expandable/collapsible tree with sortable columns (function, self, cumulative, calls)
- Clicking a function in the call tree highlights it in the flame graph and vice versa

## Capabilities

### New Capabilities
- `call-tree`: Expandable call tree visualization with invocation counts, self/cumulative metrics, and interactive navigation

### Modified Capabilities
- `flame-graph-visualization`: Add bidirectional linking between flame graph and call tree (click function in one, highlight in the other)

## Impact

- **New**: `internal/flamegraph/calltree.go` -- call tree conversion from pprof data
- **Modified**: `internal/api/handler.go` -- include call tree data in profile response
- **Modified**: Frontend profile viewer -- add call tree tab component
- **No breaking changes** -- additive feature alongside existing flame graph
