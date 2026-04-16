## Context

Go's `/debug/pprof/trace?seconds=N` endpoint streams a binary execution trace for the specified duration. The format is not pprof protobuf -- it is Go's own trace format, understood only by `go tool trace` and the `golang.org/x/exp/trace` package. For v1 the right approach is collect-and-download: store the raw bytes and give the user a file they can open locally.

CPU profiling already establishes the full pattern: duration input, cancellable in-flight HTTP request, progress indicator, stored in SQLite with raw bytes, exportable. Trace collection reuses every part of that pattern. The only meaningful difference is that the viewer cannot render trace data in-browser -- it shows a download card with instructions instead of a flame graph.

## Goals / Non-Goals

**Goals:**
- Collect execution traces with a configurable duration (default 5 seconds)
- Store raw trace bytes in the existing profile storage (SQLite blob)
- Show a download button in the profile viewer with clear `go tool trace` instructions
- Add Trace to the Record group in the profiling controls (duration-based, cancellable)

**Non-Goals:**
- Parsing or rendering trace data in-browser (trace format is complex; deferred to a future change)
- Goroutine timeline visualization (future)
- Changing target applications or requiring any additional setup

## Decisions

### 1. Trace as a first-class profile type

Add `Trace ProfileType = "trace"` to the `profiler` package constants. The existing `CollectedProfile` struct and `storage.ProfileRecord` already store raw bytes and a `DurationSec` field -- no schema changes needed.

**Why**: Reusing the profile storage means trace files get all existing features for free: listing, deletion, labelling, export endpoint.

### 2. `CollectTrace` mirrors `CollectCPU`

```go
func (c *Collector) CollectTrace(ctx context.Context, baseURL string, durationSec int) (*CollectedProfile, error) {
    url := fmt.Sprintf("%s/debug/pprof/trace?seconds=%d", baseURL, durationSec)
    data, err := c.fetch(ctx, url)
    // ...
    return &CollectedProfile{Type: Trace, Data: data, DurationSec: durationSec, ...}, nil
}
```

The existing `fetch` helper and the 5-minute `http.Client` timeout cover traces up to ~4 minutes without changes.

**Why**: Minimal new code. The HTTP client already handles long-running requests.

### 3. Handler: trace is cancellable like CPU

In `startProfile`, `"trace"` is handled identically to `"cpu"`: create a cancellable context, store the cancel func in `activeCancel`, stream the result. `DELETE /api/targets/{id}/profiles/active` cancels a trace in the same way it cancels a CPU profile.

**Why**: Same user-facing behaviour -- progress bar, cancel button, duration countdown. No new API surface needed.

### 4. Frontend: Trace in the Record group

The `ProfilingControls` component in `ConnectionDetail.tsx` already has a "Record" group with CPU. Trace is added as a second button in that group. `isRecording` becomes `profileType === "cpu" || profileType === "trace"`, which enables the duration input and progress bar for both.

Default duration for trace: 5 seconds (shorter than CPU's 30s default -- traces grow quickly).

**Why**: Trace is conceptually a recording -- it has a duration and blocks until complete. Placing it next to CPU makes the grouping accurate and the UI consistent.

### 5. Profile viewer: download card for trace type

`ProfileViewer` currently calls `api.getProfile(id)`, which parses the data as pprof and returns flame graph JSON. For trace type this will fail. Two options:

- **Option A**: `getProfile` detects trace type and returns metadata-only (no flame graph parsing)
- **Option B**: Add a separate `GET /api/profiles/{id}/meta` endpoint

**Decision: Option A** -- `getProfile` already returns `rec.Type`. Add a guard: if `rec.Type === "trace"`, skip `profile.ParseData` and return metadata + a `"trace": true` flag. The frontend checks `profile.type === "trace"` and renders a download card instead of the flame graph tabs.

**Why**: One change in the handler vs adding a new endpoint. The frontend already checks profile type for badge rendering -- the same check drives the viewer layout.

### 6. Download card content

```
This is a Go execution trace.

To view it, download the file and run:
  go tool trace <filename>.trace

The trace viewer shows goroutine scheduling, GC events,
syscalls, and network I/O with nanosecond precision.
```

A prominent "Download trace" button calls the existing `GET /api/profiles/{id}/raw` endpoint. The `Content-Disposition` filename uses `.trace` extension instead of `.pb.gz`.

**Why**: `go tool trace` is the standard tool; clear instructions lower the barrier. The existing export endpoint already serves raw bytes.

## Risks / Trade-offs

- **Trace file size**: Traces grow at ~1-2 MB/s under load. A 30-second trace can be 60 MB. For v1 this is acceptable -- users set the duration themselves. Future: warn if estimated size exceeds a threshold.
- **`getProfile` handler change**: Skipping `profile.ParseData` for trace type means the existing flame graph path is unchanged; the guard is a one-liner `if rec.Type == "trace"`.
- **No in-browser rendering**: The download-only approach is intentional for v1. The trace format is complex enough that a proper renderer is a separate, significant feature.
