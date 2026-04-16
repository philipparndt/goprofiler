## 1. Focus State and Visible Rows

- [x] 1.1 Refactor CallTree to compute a flat `visibleRows` array (with path and depth) before rendering, add `focusIndex` state
- [x] 1.2 Add `tabIndex={0}` and `onKeyDown` handler to the scrollable container
- [x] 1.3 Add visual focus indicator (left accent border + background tint) to the focused row, auto-scroll into view

## 2. Keyboard Navigation

- [x] 2.1 Implement Up/Down arrow to move focusIndex, clamped to visible range
- [x] 2.2 Implement Right arrow: expand collapsed node or move to first child
- [x] 2.3 Implement Left arrow: collapse expanded node or move to parent
- [x] 2.4 Implement Enter/Space to select focused row (trigger onSelectFunction)
- [x] 2.5 Implement Home/End to jump to first/last visible row
- [x] 2.6 Implement `*` to expand all descendants of focused node
