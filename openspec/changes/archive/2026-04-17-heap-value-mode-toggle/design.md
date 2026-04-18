## Context

Heap profiles have 4 value types: `alloc_objects` (idx 0), `alloc_space` (idx 1), `inuse_objects` (idx 2), `inuse_space` (idx 3). Currently `bestValueIndex` always picks `inuse_space` for heap profiles. The flame graph and call tree only visualize this one index.

## Decisions

### 1. Query param `?valueMode=alloc` on getProfile

When `valueMode=alloc`, override `bestValueIndex` to return the `alloc_space` index instead of `inuse_space`. This affects the flame graph, call tree, and heap summary primary values. The "other" columns (alloc in inuse mode, inuse in alloc mode) continue to show the secondary data.

### 2. Frontend toggle: "Inuse" / "Alloc" buttons

Two toggle buttons in the toolbar (like the Abs/% toggle in the call tree). Only visible for heap profiles. Switching re-fetches the profile with the new mode.

## Risks / Trade-offs

- **Re-fetch on toggle** -> Adds a round trip. Could cache both modes client-side, but keeping it simple for now.
