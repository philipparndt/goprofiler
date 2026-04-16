## Why

The profiler hardcodes five profile types: CPU, Heap, Goroutine, Block, and Mutex. Go's `net/http/pprof` package is extensible -- applications can register custom profiles via `pprof.NewProfile()`, and future Go versions may add new built-in types. Users running such applications see no way to collect those custom profiles, and there is no indication that additional types exist.

Go's `/debug/pprof/` index page dynamically lists every registered profile along with its current item count. By parsing this page we can discover exactly what a given target supports, show only what is available, and surface custom profiles the app has registered.

## What Changes

- Add a backend endpoint that fetches and parses the `/debug/pprof/` index for a connected target and returns the list of available profile names with their counts
- Cache discovered profiles per connection so repeated UI renders do not hammer the target
- Replace the hardcoded profile type selector on the Connections page and the Profiles "New Profile" dialog with a dynamic list sourced from the discovery endpoint
- Group known types (CPU, Heap, Goroutine, Block, Mutex) under their existing Record/Snapshot grouping; surface any additional types in a separate "Custom" group

## Capabilities

### New Capabilities
- `profile-discovery`: Fetch and cache the set of profiles available on a target by parsing its `/debug/pprof/` index page

### Modified Capabilities
- `profile-collection`: Profile type selector is populated dynamically from discovered types rather than a hardcoded list

## Impact

- **Added**: `internal/profiler/discovery.go` -- HTML parser and `DiscoveredProfile` type
- **Modified**: `internal/api/handler.go` -- new `/targets/{id}/profiles/available` endpoint; cache layer per target
- **Modified**: `frontend/src/api.ts` -- add `listAvailableProfiles` call
- **Modified**: `frontend/src/pages/ConnectionDetail.tsx` -- dynamic profile type selector
- **Modified**: `frontend/src/pages/ProfilesPage.tsx` (New Profile dialog) -- dynamic type list
