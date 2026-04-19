## Why

The flame graph tooltips currently only show the function name. When analyzing profiles, developers need to see the absolute value (e.g., "24.3 MB" for heap, "150ms" for CPU) alongside the percentage and sample count to quickly assess the impact of each frame without switching to the call tree view.

## What Changes

- Replace the default d3-flame-graph tooltip with a custom tooltip that shows:
  - Function name
  - Absolute value (formatted as bytes for heap profiles, time duration for CPU profiles, count for others)
  - Percentage of total (relative to root node value)
  - Number of samples
- Format values based on profile type (heap/allocs → bytes, CPU → duration, others → sample count)

## Capabilities

### New Capabilities
- `flamegraph-rich-tooltip`: Enhanced flame graph tooltips showing absolute sizes, percentages, and sample counts alongside the function name

### Modified Capabilities

## Impact

- **Frontend**: `ProfileViewer.tsx` — custom tooltip configuration for d3-flame-graph; `d3-flame-graph.d.ts` — update type definition to accept tooltip object
- No backend changes — `FlameNode.value` already carries absolute values
