## Why

GoProfiler already has a live memory monitor that shows heap and GC trends in real time. Goroutine leaks are equally common in Go and just as difficult to spot from point-in-time snapshots alone. A sustained rise in goroutine count -- even a slow one -- almost always indicates a leak or runaway producer. A live goroutine count chart gives developers the same immediate feedback for goroutines that the memory chart gives for heap usage. Additionally, knowing _which_ goroutines are accumulating is critical for diagnosis, so a live grouping table (top goroutine stacks by count) lets developers pinpoint the leak without having to capture and diff full goroutine snapshots.

## What Changes

- Add a live goroutine count chart to the Monitor view alongside the existing memory chart, polling at the same 1s interval
- The goroutine count is collected for free by extending the existing `MemStats` poll: parse `runtime.NumGoroutine` from `/debug/pprof/heap?debug=1` or read it directly from `/debug/pprof/goroutine?debug=1` (first line)
- Add a goroutine stack grouping table showing the top N goroutine groups by count, fetched on demand from a new backend endpoint that parses `/debug/pprof/goroutine?debug=1`
- Show a warning indicator when goroutine count exceeds a configurable threshold or exhibits sustained growth

## Capabilities

### New Capabilities
- `goroutine-live-chart`: Real-time scrolling goroutine count chart with warning threshold indicator
- `goroutine-stack-grouping`: On-demand table of top goroutine groups by count parsed from the goroutine pprof debug output

### Modified Capabilities
- `live-memory-chart`: Extend the existing `DataPoint` struct and poll response to include goroutine count
- `connection-detail-view`: Expand the Monitor tab to show both memory and goroutine charts, and the goroutine groups table

## Non-Goals

- Storing goroutine history persistently (live view only, ring buffer)
- Full goroutine profile capture (that is already covered by the existing goroutine snapshot in profiling controls)
- Per-goroutine tracing or execution timeline

## Impact

- **Modified**: `internal/monitor/memstats.go` -- also parse goroutine count from the debug output (or fetch from goroutine endpoint)
- **Modified**: `internal/monitor/collector.go` -- add `NumGoroutines` field to `DataPoint`
- **New**: `internal/monitor/goroutine.go` -- fetch and parse goroutine stack grouping from `/debug/pprof/goroutine?debug=1`
- **New**: `GET /api/targets/{id}/goroutine-groups` -- return top N goroutine groups by count
- **New**: Frontend `GoroutineChart` component (canvas-based, same style as `MemoryChart`)
- **New**: Frontend `GoroutineGroupsTable` component
- **Modified**: `ConnectionDetail.tsx` -- expand Monitor tab to include goroutine chart and groups table
- **No changes to target applications** -- uses existing `/debug/pprof/` endpoints
