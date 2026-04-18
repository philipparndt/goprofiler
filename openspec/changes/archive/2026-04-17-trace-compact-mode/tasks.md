## 1. Gap Detection

- [x] 1.1 Compute "active intervals" from all visible spans across all goroutines (merge overlapping intervals)
- [x] 1.2 Find gaps between active intervals exceeding the threshold (max of 1ms or 2% of visible range)
- [x] 1.3 Build a compacted coordinate mapping: array of segments (realStartNs, realEndNs, compactStartPx, compactEndPx) and breaks (realStartNs, realEndNs, compactStartPx, width=40px, durationLabel)

## 2. Rendering

- [x] 2.1 Replace linear xScale with piecewise mapping function that maps ns -> px using the segment/break array
- [x] 2.2 Add inverse mapping (px -> ns) for mouse interactions (hover, click, drag)
- [x] 2.3 Render break zones: diagonal hatch pattern background with centered duration label
- [x] 2.4 Update time axis to skip break zones and show correct labels for each segment

## 3. UI

- [x] 3.1 Add "Compact" checkbox to the trace timeline toolbar
- [x] 3.2 Recompute the mapping when compact mode is toggled or when state filters change
- [x] 3.3 Adjust zoom/pan to work in compact coordinate space
