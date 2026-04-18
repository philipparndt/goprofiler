## Context

d3-flame-graph has two value modes:
- `.selfValue(false)` (default): `value` = cumulative (total including children). Children widths are proportional to their own `value` relative to parent's `value`. Parent width = max(own value, sum of children).
- `.selfValue(true)`: `value` = self only. d3 computes cumulative by summing up the tree. Gap between parent total and children sum = self time.

Our backend sets `Node.Value` to cumulative (total samples passing through that frame). We incorrectly set `.selfValue(true)`, causing d3 to misinterpret cumulative as self.

## Fix

Change `.selfValue(true)` to `.selfValue(false)`. One line.

With this fix:
- Parent frame width = its `value` (cumulative)
- Children fill the parent proportionally
- Gap = self time (parent value - sum of children values) -- which is correct
- A function with 0ns self time and 240ms cumulative will have children fully filling its width
