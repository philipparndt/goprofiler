## 1. Backend: Profile Filtering

- [x] 1.1 Add `FilterPprofOverhead(p *profile.Profile)` function in `internal/flamegraph/filter.go` that calls `p.Prune` with regex matching `runtime/pprof` and `net/http/pprof` packages
- [x] 1.2 Update `getProfile` handler to accept `?filter=pprof` query param; when set, apply `FilterPprofOverhead` to the parsed profile before converting to flame graph / call tree / heap summary

## 2. Frontend: Filter Toggle

- [x] 2.1 Add `filterPprof` state to ProfileViewer, default `true` for heap/allocs types, `false` otherwise
- [x] 2.2 Pass `filter=pprof` query param to `api.getProfile(id)` when the toggle is on
- [x] 2.3 Add "Hide profiler overhead" toggle button in the profile viewer toolbar, only visible for heap/allocs profile types
- [x] 2.4 Re-fetch profile data when the toggle changes
