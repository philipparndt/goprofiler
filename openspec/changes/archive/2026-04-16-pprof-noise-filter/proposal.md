## Why

Taking heap snapshots via `/debug/pprof/heap` causes the pprof handler itself to allocate significant memory -- writing the profile output involves `runtime/pprof.printStackRecord`, `text/tabwriter`, `bufio`, `fmt` etc. These allocations show up in the profile as the top entries, dwarfing the application's actual memory usage. For alloc profiles (total allocations since start), these pprof-induced allocations accumulate with every snapshot, making them increasingly dominant over time.

This is observer-effect noise -- the act of measuring pollutes the measurement. Users need a way to filter out pprof/runtime profiling infrastructure from profiles to see only their application's real allocations.

## What Changes

- Add server-side filtering to strip pprof infrastructure samples from profiles before analysis
- Filter applies to both flame graph and call tree, and recalculates totals after filtering
- Toggle in the profile viewer UI: "Hide profiler overhead" (on by default for heap/allocs profiles)
- The filter removes samples where the stack contains known pprof infrastructure packages: `runtime/pprof`, `net/http/pprof`, `text/tabwriter`, `bufio` (when called from pprof)
- The heap summary bar recalculates inuse/alloc totals after filtering

## Capabilities

### New Capabilities
- `pprof-noise-filter`: Server-side filtering of pprof infrastructure overhead from heap and alloc profiles

### Modified Capabilities

_None._

## Impact

- **Modified**: `internal/flamegraph/convert.go` -- add sample filtering before building flame graph and top functions
- **Modified**: `internal/flamegraph/calltree.go` -- same filtering for call tree
- **Modified**: `internal/api/handler.go` -- accept `filter=pprof` query param on getProfile, filter before conversion
- **Modified**: Frontend profile viewer -- toggle for "Hide profiler overhead"
- **No changes to data storage** -- filtering is applied at view time, raw profiles are preserved
