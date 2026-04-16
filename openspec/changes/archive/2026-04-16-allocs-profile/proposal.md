## Why

The app currently supports heap, goroutine, block, and mutex as snapshot profile types. Heap shows current live heap objects -- objects the GC has already collected are invisible. This makes it hard to diagnose code that allocates heavily but releases quickly, since the allocation pressure never shows up in a heap snapshot.

Go's `/debug/pprof/allocs` endpoint records **all** memory allocations since program start, not just live objects. This makes allocation-hot code visible even when the objects are short-lived. The two profiles answer different questions: heap tells you what is alive, allocs tells you what was ever allocated.

## What Changes

- Add `allocs` as a supported snapshot profile type alongside heap, goroutine, block, and mutex
- Backend collector gains a new case fetching `/debug/pprof/allocs`
- Frontend adds "Allocs" to the snapshot type selector and profile type filter

## Capabilities

### New Capabilities

_None -- this extends an existing capability rather than adding a new one._

### Modified Capabilities

- `profile-collection`: Add `allocs` as a supported snapshot profile type. The backend fetches `/debug/pprof/allocs`. The frontend exposes it in the snapshot group of the profile type selector.

## Impact

- **Modified**: `internal/profiler/collector.go` -- add `Allocs` constant and endpoint case
- **Modified**: `frontend/src/api.ts` -- add `"allocs"` to the profile type union
- **Modified**: `frontend/src/pages/ConnectionDetail.tsx` -- add allocs to the snapshot type list
- **No new APIs, no schema changes, no storage changes** -- allocs profiles are pprof protobuf format, identical to heap/goroutine/block/mutex
