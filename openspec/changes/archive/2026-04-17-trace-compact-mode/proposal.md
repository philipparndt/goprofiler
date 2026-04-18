## Why

When filtering trace states (e.g., showing only "running" spans), the timeline becomes mostly empty space with long gaps between visible spans. Users must scroll through vast dead zones to find the next activity. This makes the filtered view nearly unusable for traces where the filtered state only occurs in bursts.

A compact mode would collapse the empty gaps while preserving a visual indicator of how much time was skipped, making it much easier to scan through filtered activity.

## What Changes

- Add a "Compact" checkbox to the trace timeline toolbar
- When enabled, detect gaps between visible spans (across all goroutines) that exceed a threshold
- Collapse those gaps to a fixed narrow width with a visual break indicator showing the skipped duration (e.g., `~100ms~`)
- The time axis adapts to show the non-linear timeline with break markers
- Zoom and pan still work, operating on the compacted coordinate space

## Capabilities

### New Capabilities
- `trace-compact-mode`: Collapse empty gaps in the trace timeline when states are filtered, with duration labels on break markers

### Modified Capabilities

_None._

## Impact

- **Modified**: `TraceTimeline.tsx` -- add compact mode logic, gap detection, break rendering, adapted coordinate mapping
- **No backend changes** -- compaction is purely a frontend rendering concern
