## Why

The profiler currently monitors memory usage (heap, sys, GC events) and goroutine counts in real-time, but has no visibility into CPU utilization. CPU profiling is only available as on-demand snapshots via pprof. Adding a continuous CPU monitor — similar to the existing memory chart — gives developers a live view of CPU usage patterns alongside memory, enabling faster diagnosis of performance issues.

## What Changes

- Add backend CPU profile sampling that continuously collects CPU usage data from target Go processes
- Store CPU data points in a time-series buffer (matching the existing 7200-point / 2-hour rolling window pattern)
- Expose a new API endpoint for CPU history data with incremental polling support
- Add a `CpuChart` frontend component rendered in the Monitor tab alongside the existing MemoryChart
- CPU monitoring is disabled by default and can be toggled on/off per target via the UI, since profiling adds overhead to the target process

## Capabilities

### New Capabilities
- `cpu-monitor`: Real-time CPU usage monitoring with time-series chart, following the same collection and display patterns as the existing memory monitor

### Modified Capabilities

## Impact

- **Backend**: New files in `internal/monitor/` for CPU stats collection; new handler in `internal/api/handler.go`
- **Frontend**: New `CpuChart.tsx` component; updated `ConnectionDetail.tsx` to include the CPU chart in the Monitor tab; new API types and method in `api.ts`
- **Dependencies**: Uses Go's `runtime/pprof` CPU profile endpoint (`/debug/pprof/profile`) on the target process
