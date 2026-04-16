## 1. Backend: Trace Collector

- [x] 1.1 Add `Trace ProfileType = "trace"` constant to `internal/profiler/collector.go`
- [x] 1.2 Implement `CollectTrace(ctx, baseURL, durationSec)` on `Collector` -- fetches `/debug/pprof/trace?seconds=N` and returns a `CollectedProfile` with the raw bytes and `DurationSec` set

## 2. Backend: Handler

- [x] 2.1 Handle `"trace"` type in `startProfile` in `internal/api/handler.go` -- use a cancellable context (same as CPU), call `CollectTrace`, save with `saveCollected`
- [x] 2.2 Update `getProfile` handler to skip `profile.ParseData` for trace type -- return metadata only with a `"traceType": true` field so the frontend can detect it without attempting pprof parsing
- [x] 2.3 Update `exportProfile` handler to use `.trace` filename extension when `Content-Disposition` is set for trace-type profiles

## 3. Frontend: Profiling Controls

- [x] 3.1 Add `"trace"` to the `ProfileType` union in `ConnectionDetail.tsx`
- [x] 3.2 Add a Trace button to the Record group in `ProfilingControls`, next to CPU
- [x] 3.3 Update `isRecording` to be true for both `"cpu"` and `"trace"`, enabling the duration input and progress bar; set default duration to 5 seconds when trace is selected

## 4. Frontend: Profile Viewer

- [x] 4.1 In `ProfileViewer.tsx`, detect `profile.type === "trace"` and skip the flame graph render
- [x] 4.2 Render a trace download card showing: a "Download trace" button (calls `api.exportProfile`), the trace file size, and instructions for `go tool trace <filename>.trace`

## 5. Frontend: Profile Type Badge

- [x] 5.1 Add `"trace"` to the type filter buttons in the profiles list on `ConnectionDetail.tsx`
- [x] 5.2 Add `"trace"` to the StartProfileRequest type union
