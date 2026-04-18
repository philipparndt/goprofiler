## Why

When refreshing a heap snapshot, it's hard to tell what changed. The numbers update but the previous values are gone. Showing a delta (e.g., "+2.3 MB" or "-500 objects") next to the current values makes the trend immediately visible -- is memory growing or shrinking? This is critical for leak hunting: refresh repeatedly and watch the deltas.

## What Changes

- When a heap profile is refreshed, remember the previous heap summary values
- Show delta values next to In Use and Total Allocated: green for decrease, red for increase
- Deltas persist until the user navigates away or refreshes again (then new delta is calculated)
- Frontend-only change -- store previous values in component state

## Capabilities

### Modified Capabilities
- `refresh-snapshot`: Show delta values in heap summary after refresh

## Impact

- **Modified**: Frontend `ProfileViewer.tsx` -- track previous heap summary, display deltas in HeapStat component
- **No backend changes**
