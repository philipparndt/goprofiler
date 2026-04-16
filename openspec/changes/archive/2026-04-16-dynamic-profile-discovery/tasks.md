## 1. Backend: pprof Index Parser

- [x] 1.1 Create `internal/profiler/discovery.go` with a `DiscoveredProfile` struct (`Name string`, `Count *int`, `Kind string`) and a `ParsePprofIndex(html string) ([]DiscoveredProfile, error)` function that extracts profile entries from the `/debug/pprof/` index page
- [x] 1.2 Map the `profile` index entry to `name: "cpu"`, `kind: "recording"` and skip the `trace` entry; mark all other entries as `kind: "snapshot"`
- [x] 1.3 Add unit tests for `ParsePprofIndex` covering: standard Go output, custom profiles present, malformed HTML (should return empty slice, no error)

## 2. Backend: Discovery Endpoint

- [x] 2.1 Add a `FetchAvailableProfiles(ctx context.Context, baseURL string) ([]DiscoveredProfile, error)` method to `Collector` (or a new `Discoverer`) in `internal/profiler/` that GETs `baseURL/debug/pprof/` and calls `ParsePprofIndex`
- [x] 2.2 Add an in-memory cache in `Handler` (map from connection ID to `[]DiscoveredProfile`) with eviction when a connection is removed
- [x] 2.3 Register route `GET /targets/{id}/profiles/available` in `handler.go` that returns the cached result or fetches and caches on first call; return 404 for unknown ID, 502 on fetch failure
- [x] 2.4 Evict cache entry in the existing delete-connection handler

## 3. Frontend: API and Type Selector

- [x] 3.1 Add `listAvailableProfiles(targetId: string): Promise<AvailableProfile[]>` to `frontend/src/api.ts` with the matching `AvailableProfile` type (`name`, `count`, `kind`)
- [x] 3.2 Extract the profile type selector in `ConnectionDetail.tsx` into a reusable `ProfileTypeSelector` component that accepts an `availableProfiles` prop; keep the existing Record / Snapshot grouping logic
- [x] 3.3 In `ProfileTypeSelector`, add a third "Custom" group that renders any profiles whose name is not in the well-known set (`cpu`, `heap`, `goroutine`, `block`, `mutex`)
- [x] 3.4 Call `listAvailableProfiles` when the target changes; show a spinner while loading and fall back to the hardcoded five types on error, with a warning indicator
- [x] 3.5 Add a small refresh icon button to `ProfileTypeSelector` that clears local state and re-fetches discovery for the current target
- [x] 3.6 Update the New Profile dialog on the Profiles page to use `ProfileTypeSelector` with the same discovery logic
