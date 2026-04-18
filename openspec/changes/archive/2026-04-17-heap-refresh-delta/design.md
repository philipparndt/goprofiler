## Context

The ProfileViewer already has a Refresh button for snapshot profiles and a `HeapStat` component showing In Use and Total Allocated. After refresh, `loadProfile()` is called which updates the profile state.

## Decisions

### 1. Track previous heap summary in state

Before refresh overwrites the profile, save the current `heapSummary` values into a `prevHeapSummary` state. After refresh completes and the new profile loads, compute deltas.

### 2. Display format

```
In Use                    Total Allocated
12.6 MB  (+2.3 MB)        45.2 MB  (+5.1 MB)
166,697 objects (+1,200)   1,234,567 objects (+12,345)
```

- Positive delta (increase): red text, `+` prefix
- Negative delta (decrease): green text, `-` prefix (auto from formatting)
- Zero delta: gray, `±0`

### 3. Deltas clear on navigation

The `prevHeapSummary` state resets to null when `id` changes (navigating to a different profile). Deltas only show after a refresh action.
