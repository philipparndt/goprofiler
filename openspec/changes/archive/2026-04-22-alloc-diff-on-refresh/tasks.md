## 1. Backend: Compute diff on refresh

- [x] 1.1 In `refreshProfile` handler: before overwriting, read and parse the old profile data
- [x] 1.2 After saving new data, parse the new profile, compute diff (old alloc_space scaled -1, merge with new), convert to flame graph + call tree
- [x] 1.3 Store the diff result temporarily and return it in the refresh response as a `refreshDiff` field

## 2. Frontend: New allocations toggle

- [x] 2.1 Store the `refreshDiff` data in ProfileViewer state (set from refresh response, cleared on navigation)
- [x] 2.2 Add "New allocations / Absolute" toggle, visible only when `refreshDiff` is present
- [x] 2.3 When "New allocations" is active, swap the flame graph and call tree data to use `refreshDiff`, apply diff color scheme to flame graph
