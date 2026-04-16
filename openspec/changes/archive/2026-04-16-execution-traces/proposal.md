## Why

Go execution traces are the most powerful tool for understanding concurrency behavior -- they capture goroutine scheduling, syscalls, GC events, and network I/O with nanosecond precision. Currently GoProfiler has no support for traces, leaving developers without visibility into scheduling latency, goroutine stalls, and runtime-level interactions that CPU profiles and heap snapshots cannot reveal. Adding trace collection fills this critical gap.

## What Changes

- Add "Trace" to the Record group in the profiling controls alongside CPU (both are duration-based)
- Backend fetches `/debug/pprof/trace?seconds=N` and stores the raw binary data without parsing
- Profile viewer detects trace type and shows a download button with instructions for opening the file with `go tool trace`
- Traces appear in profile lists like any other profile type, with a distinct badge

## Capabilities

### New Capabilities
- `execution-traces`: Collect Go execution traces from a connected target for a configurable duration, store the raw binary, and offer download with instructions for `go tool trace`

### Modified Capabilities
- `profile-collection`: Trace type added to the Record group in the profiling controls
- `profile-collection`: `CollectTrace` method added to the backend collector alongside `CollectCPU`

## Impact

- **New**: `internal/profiler/collector.go` -- `CollectTrace` method fetching `/debug/pprof/trace?seconds=N`
- **New**: `Trace` profile type constant in `profiler` package
- **Modified**: `internal/api/handler.go` -- handle `"trace"` type in `startProfile`, cancelable like CPU
- **Modified**: `frontend/src/pages/ConnectionDetail.tsx` -- add Trace button to Record group, show duration input for trace
- **Modified**: `frontend/src/pages/ProfileViewer.tsx` -- detect trace type, render download card with `go tool trace` instructions instead of flame graph
- **Modified**: `frontend/src/components/ProfileTypeBadge.tsx` -- add trace badge variant
- **No changes to target applications** -- uses the standard `/debug/pprof/trace` endpoint present in any Go app importing `net/http/pprof`
