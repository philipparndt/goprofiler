## 1. Frontend

- [x] 1.1 Add `prevHeapSummary` state to ProfileViewer, initialized to null, reset when `id` changes
- [x] 1.2 Before calling `loadProfile()` in the refresh handler, save the current heapSummary to `prevHeapSummary`
- [x] 1.3 Update `HeapStat` component to accept optional `prevValue` and `prevObjects` props, render delta with color coding (red for increase, green for decrease)
