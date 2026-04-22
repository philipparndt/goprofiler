## Context

The refresh endpoint already overwrites the profile file with new data. The `heap-refresh-delta` change added delta display for summary numbers by saving previous values in frontend state. But the raw previous profile data is lost after overwrite, so we can't compute a per-function diff.

## Decisions

### 1. Backend: save previous raw data before overwrite, compute diff

On refresh:
1. Read the old profile data before overwriting
2. Overwrite with new data (existing behavior)
3. Parse both old and new profiles
4. Compute a diff using the existing `profile.Scale(-1)` + `profile.Merge` pattern
5. Return the diff flame graph and call tree alongside the regular new profile data

The diff is returned as an optional `refreshDiff` field in the response:
```json
{
  "id": "...",
  "heapSummary": { ... },
  "flameGraph": { ... },        // normal new data
  "callTree": { ... },          // normal new data
  "refreshDiff": {              // only present after refresh
    "flameGraph": { ... },      // diff values (positive = new allocations)
    "topFunctions": [ ... ],    // diff top functions
    "callTree": { ... }         // diff call tree
  }
}
```

### 2. Frontend: "Show new allocations" toggle

After a refresh, if `refreshDiff` is present in the response:
- Show a toggle: "New allocations" / "Absolute"
- When "New allocations" is selected, swap the flame graph and call tree data to use `refreshDiff`
- The flame graph uses the diff color scheme (red = new allocations, blue = freed)
- The call tree shows delta values

### 3. Diff only for alloc_space (not inuse)

The diff uses `alloc_space` values since that's cumulative -- the delta shows exactly what was allocated between the two snapshots. `inuse_space` changes are already visible in the regular inuse deltas.

## Risks / Trade-offs

- **Memory**: Temporarily holds two parsed profiles in memory. For typical heap profiles (~1MB) this is fine.
- **Only available immediately after refresh**: The diff data lives in the API response state. Navigating away and back loses it. This is acceptable -- the user can just refresh again.
