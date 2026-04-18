## Why

The header already shows total allocation deltas after refresh (e.g., "+5.1 MB"), but the flame graph and call tree still show the absolute cumulative alloc values. Users want to see _where_ the new allocations happened -- which functions allocated memory between the two snapshots. This is essentially an automatic diff of the alloc values between the previous and current snapshot, shown directly in the flame graph and call tree.

This is the killer feature for leak hunting: refresh repeatedly and see exactly which call paths are allocating new memory.

## What Changes

- When refreshing a heap profile, keep the raw previous profile data (not just the summary numbers)
- Add a "Show new allocations" toggle (only visible after a refresh) that switches the alloc columns in the flame graph and call tree to show deltas instead of absolutes
- Backend: new endpoint or parameter to compute a diff between two profile snapshots stored for the same profile ID
- Store the previous raw profile temporarily in the backend on refresh, return a diff alongside the new data

## Capabilities

### New Capabilities
- `alloc-diff-on-refresh`: Show allocation deltas in flame graph and call tree after refreshing a heap snapshot

### Modified Capabilities

_None._

## Impact

- **Modified**: Backend `POST /api/profiles/{id}/refresh` -- keep previous data, compute diff, return diff alongside new profile
- **Modified**: Frontend ProfileViewer -- "Show new allocations" toggle after refresh, switches flame graph/call tree to diff view
- **Modified**: Frontend HeapStat -- already shows deltas (from heap-refresh-delta change)
