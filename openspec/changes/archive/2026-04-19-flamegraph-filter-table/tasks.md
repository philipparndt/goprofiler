## 1. Zoom State Tracking

- [x] 1.1 Add `zoomedNode` state (`FlameNode | null`) to ProfileViewer and register a `clickHandler` on the d3-flame-graph instance to capture the clicked node; clear on `resetZoom`
- [x] 1.2 Write a helper function `collectSubtreeNames(node: FlameNode): Set<string>` that walks a FlameNode subtree and returns all unique function names

## 2. Table Filtering

- [x] 2.1 When `zoomedNode` is set, filter `topFunctions` to only include entries whose name is in the subtree name set, and recompute percentage values relative to the zoomed node's value
- [x] 2.2 Add a filter indicator above the TopFunctionsTable showing the zoomed function name and a reset button

## 3. Edge Cases

- [x] 3.1 Ensure zoom state resets when profile data changes (different profile loaded), tab switches, or color/view mode changes that re-create the chart
