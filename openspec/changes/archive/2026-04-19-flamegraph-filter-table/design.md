## Context

The ProfileViewer renders a d3-flame-graph and a TopFunctionsTable side by side. Currently they are independent: zooming into a flame graph subtree doesn't affect the table. The flame graph zoom state lives inside the d3-flame-graph library instance (accessed via `fgRef.current`) and is not exposed to React.

The `TopFunctionsTable` receives `profile.topFunctions` (a flat array of `TopFunction` objects computed server-side) and always shows the full profile. The flame graph data is a tree of `FlameNode` objects with `name`, `value`, and `children`.

## Goals / Non-Goals

**Goals:**
- When the user zooms into a flame graph node, filter the top functions table to only show functions within that subtree
- Recompute flat/cumulative percentages relative to the zoomed subtree's total value
- Clear the filter when zoom is reset

**Non-Goals:**
- Changing the call tree tab behavior (it has its own navigation)
- Backend changes or new API endpoints
- Filtering the DiffViewer's table (separate component, can be done later)

## Decisions

### 1. Use d3-flame-graph's onClick handler to track zoomed node

**Decision:** Register a `clickHandler` on the d3-flame-graph instance that sets a React state variable (`zoomedNode`) to the clicked `FlameNode`. On reset zoom, clear the state.

**Why:** d3-flame-graph supports `onClick(handler)` callbacks. This is the cleanest way to bridge the library's internal zoom state into React without modifying the library.

### 2. Client-side subtree traversal for filtering

**Decision:** When `zoomedNode` is set, walk the subtree to collect all function names present, then filter `topFunctions` to only include those names. Recompute percentages relative to the zoomed node's value.

**Why:** The `FlameNode` tree is already in memory. Walking it is O(n) where n is the subtree size — fast enough for any realistic profile. No server roundtrip needed.

### 3. Show indicator when table is filtered

**Decision:** Display a small badge or text near the table header showing the zoomed function name, with a clear/reset link.

**Why:** Users need to understand why they're seeing fewer rows and how to get back to the full view.

## Risks / Trade-offs

- **[Stale reference]** The d3-flame-graph click handler captures a closure. If the chart is re-created (e.g., color mode change), the handler must be re-registered. → Mitigation: The chart is already re-created in the existing useEffect; just include the handler there.
- **[Name collisions]** Two different stack frames may have the same function name. Filtering by name is intentional — it matches how `topFunctions` works (aggregated by name). No risk of incorrect behavior.
