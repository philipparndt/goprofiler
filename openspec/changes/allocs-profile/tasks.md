## 1. Backend: Add allocs profile type

- [x] 1.1 Add `Allocs ProfileType = "allocs"` constant to the `ProfileType` enum in `internal/profiler/collector.go`
- [x] 1.2 Add a case for `Allocs` in `CollectSnapshot` mapping to endpoint `/debug/pprof/allocs`

## 2. Frontend: Expose allocs in snapshot type selector

- [x] 2.1 Add `"allocs"` to the profile type union in `frontend/src/api.ts`
- [x] 2.2 Add `"allocs"` to the snapshot types list in `frontend/src/pages/ConnectionDetail.tsx` (the array iterated to render snapshot buttons)
- [x] 2.3 Add `"allocs"` to the profile type filter dropdown on the Profiles list page

## 3. Frontend: Update setup page

- [x] 3.1 Add a description of the allocs profile type to the setup/help page, noting the difference from heap (cumulative allocations vs. current live objects)
