## Context

When fetching `/debug/pprof/heap`, Go's pprof handler generates the profile response by iterating over all live heap objects. This process itself allocates memory (via tabwriter, fmt, bufio, etc.), and those allocations appear in the profile. For `alloc_space` (total allocations), each snapshot adds more pprof overhead to the cumulative total.

Top offenders in a typical heap profile:
- `runtime/pprof.printStackRecord` -- serializes stack traces
- `runtime/pprof.writeHeapInternal` -- writes the profile
- `text/tabwriter.(*Writer).Write` -- formatting output
- `bufio.NewWriterSize` -- buffered I/O
- `fmt.(*fmt).pad` -- string formatting

## Goals / Non-Goals

**Goals:**
- Filter out pprof infrastructure from flame graph, call tree, top functions, and heap summary
- Apply filter server-side so all views are consistent
- On by default for heap/allocs, toggleable in the UI
- Preserve raw data (filter at view time, not at collection)

**Non-Goals:**
- Remove pprof overhead from the raw stored profile file
- Filter CPU profiles (pprof overhead is negligible for CPU profiling)

## Decisions

### 1. Server-side filtering via `profile.Prune`

Go's `google/pprof` library has `profile.Prune(dropRx, keepRx)` which removes samples matching a regex. We'll use this to prune samples containing pprof infrastructure frames.

Filter regex: `^(runtime/pprof|net/http/pprof)\b`

This drops any sample where the stack contains `runtime/pprof.*` or `net/http/pprof.*` functions. This is conservative -- it only removes the profiler's own allocations, not user code that happens to be called from an HTTP handler.

**Why**: `profile.Prune` is built into the pprof library, handles all the edge cases (recursive stacks, inlined frames), and modifies the profile in-place before we convert to flame graph. Clean and efficient.

### 2. Query parameter `?filter=pprof` on getProfile

The `GET /api/profiles/{id}` endpoint accepts `?filter=pprof` to apply the filter. The frontend sends this by default for heap/allocs profiles unless the user toggles it off.

**Why**: Keeps filtering optional and view-time only. The raw profile is never modified.

### 3. UI toggle: "Hide profiler overhead"

A toggle button in the profile viewer toolbar (next to the color mode and orientation toggles). On by default for heap/allocs, off for other types.

**Why**: Most users always want the filter on. Power users who want to debug pprof itself can toggle it off.

## Risks / Trade-offs

- **Over-filtering**: The regex only matches `runtime/pprof` and `net/http/pprof` packages. User code in `net/http` handlers is NOT filtered.
- **Totals change**: The heap summary (inuse/alloc) will show different numbers with the filter on. This is intentional -- filtered totals are more accurate for the application.
