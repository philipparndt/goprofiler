## 1. Tooltip Implementation

- [x] 1.1 Update `d3-flame-graph.d.ts` to accept `tooltip(v: boolean | object)` and define the tooltip object interface (`show`, `hide` methods)
- [x] 1.2 Create a custom tooltip factory function in `ProfileViewer.tsx` that returns a tooltip object rendering HTML with function name, absolute value, percentage, and sample count
- [x] 1.3 Add value formatters: `formatBytes(n)` for heap/allocs, `formatDuration(ns)` for CPU profiles, `formatCount(n)` for others; select formatter based on `profile.type`
- [x] 1.4 Replace `tooltip(true)` with `tooltip(customTooltip)` in the flame graph initialization, passing the root node value and profile type to the tooltip factory
