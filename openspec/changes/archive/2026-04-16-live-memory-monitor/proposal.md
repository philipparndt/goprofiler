## Why

Currently GoProfiler only offers point-in-time snapshots for memory. There's no way to watch memory usage evolve over time, spot trends (leaks, growth patterns), or correlate memory changes with GC events. JProfiler and VisualVM both provide live memory charts that are essential for understanding runtime behavior. A moving time-series chart with GC markers gives developers immediate insight into their application's memory health without needing to take repeated manual snapshots.

## What Changes

- Add a live memory monitoring tab to the connection detail page that polls `runtime.MemStats` from the target at regular intervals
- Render a real-time scrolling line chart showing: HeapAlloc (live heap), HeapSys (heap reserved), and total Sys memory
- Mark GC events on the chart as vertical markers with tooltips showing GC pause time
- Backend exposes a new endpoint to fetch `runtime.MemStats` from the target via the existing `/debug/pprof/` interface (using `expvar` or a custom handler on the target, or parsing `/debug/pprof/heap?debug=1` text output)
- The target needs no changes -- we parse the existing pprof heap debug output which includes MemStats

## Capabilities

### New Capabilities
- `live-memory-chart`: Real-time scrolling memory usage chart with HeapAlloc, HeapSys, and Sys lines
- `gc-markers`: GC event markers on the memory chart showing when collections occurred and their pause times

### Modified Capabilities
- `connection-detail-view`: Add a "Monitor" tab alongside profiling controls and profiles list

## Impact

- **New**: `internal/monitor/memstats.go` -- fetch and parse MemStats from target's pprof debug endpoint
- **New**: `GET /api/targets/{id}/memstats` -- backend endpoint returning current MemStats
- **New**: Frontend `MemoryChart` component with canvas-based scrolling chart
- **Modified**: `ConnectionDetail.tsx` -- add Monitor tab
- **No changes to target applications** -- uses existing `/debug/pprof/heap?debug=1` which includes MemStats
