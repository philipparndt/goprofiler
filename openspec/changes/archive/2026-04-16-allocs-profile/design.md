## Context

Go exposes two related memory profiling endpoints:

- `/debug/pprof/heap` -- samples live heap objects (in-use allocations). Useful for finding memory leaks and understanding steady-state memory usage.
- `/debug/pprof/allocs` -- cumulative allocation samples since program start, regardless of whether the objects are still alive. Useful for finding code that is allocation-hot even when objects are short-lived (e.g., tight loops creating temporary slices or strings that are immediately GC'd).

The profiler already handles heap, goroutine, block, and mutex as snapshot types. Allocs follows the exact same pattern: point-in-time fetch, pprof protobuf response, same parsing/storage/rendering pipeline. The only new code is the enum value and the endpoint routing.

Flame graphs and call tree views work without any changes -- the pprof format for allocs is identical to heap. The existing `CollectSnapshot` path in the backend, the profile storage model, and all frontend visualization components handle it transparently.

## Goals / Non-Goals

**Goals:**
- Add `allocs` as a first-class snapshot profile type
- Expose it in the UI alongside the existing snapshot types

**Non-Goals:**
- Change how allocs data is visualized (uses existing flame graph / call tree as-is)
- Expose allocs-specific options (e.g., `debug` parameter) -- plain binary pprof fetch is sufficient
- Rename or reorganize existing profile types

## Decisions

### 1. Add `allocs` to the snapshot type enum

The backend `ProfileType` enum gains an `Allocs` constant (`"allocs"`). The `CollectSnapshot` switch gains a case mapping it to `/debug/pprof/allocs`. No new collector logic is needed.

**Why**: The existing snapshot collection path is fully generic -- it fetches an endpoint, parses the pprof response, and stores the result. Allocs fits this model exactly.

### 2. Frontend: add to snapshot group, no new UI components

The frontend adds `"allocs"` to the snapshot type list in the connection detail / profiling control panel alongside heap, goroutine, block, and mutex. The `ProfileTypeBadge` component renders it automatically since it is type-agnostic. The `all_snapshots` capture action will include allocs once it is listed as a snapshot type.

**Why**: Minimal change. No new components, no layout changes.

### 3. Update the setup page description

The setup page explains what each profile type captures. Add a brief description of allocs vs heap to help users understand when to use each.

**Why**: Without context, users may not understand the difference between heap and allocs and might ignore allocs.

## Risks / Trade-offs

- **None significant.** This is a one-endpoint, one-enum-value addition. The pprof format is identical to the existing snapshot types, so no parsing, storage, or rendering risk.
