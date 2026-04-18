## Context

The trace timeline renders goroutine spans on a linear time axis. When states are filtered, many spans become invisible, leaving large empty regions. The canvas still renders the full time range, so users scroll through emptiness.

## Goals / Non-Goals

**Goals:**
- Collapse gaps where no visible spans exist across any goroutine
- Show a visual break indicator with the skipped duration
- Preserve relative ordering and the ability to understand time relationships
- Toggle on/off via checkbox

**Non-Goals:**
- Modifying the actual trace data
- Compacting per-goroutine (compact globally across all goroutines)

## Decisions

### 1. Gap detection algorithm

Scan all visible spans (after state filtering) across all goroutines, collect all time intervals that have at least one visible span. Merge overlapping intervals. The gaps between merged intervals that exceed a threshold (e.g., 5% of the total visible span range) are candidates for compaction.

Each gap is collapsed to a fixed pixel width (e.g., 40px) with a diagonal hatch pattern and a duration label.

### 2. Coordinate mapping with breaks

Build a mapping from "real nanoseconds" to "compact pixels":
- For each segment between breaks: linear mapping (ns -> px)
- For each break: fixed 40px width regardless of duration

The `xScale` function becomes piecewise: for any ns value, find which segment it's in, and compute the pixel position. The inverse (px -> ns) is needed for click handling.

### 3. Break rendering

Each break zone is drawn as:
- A 40px wide column with a subtle diagonal hatch pattern (gray)
- A centered label showing the skipped duration (e.g., "~120ms")
- Slightly different background to distinguish from empty timeline space

### 4. Threshold for collapsing

Only collapse gaps longer than `max(1ms, 2% of total visible time range)`. Very short gaps between bursts of activity are not worth collapsing.

## Risks / Trade-offs

- **Coordinate complexity**: The piecewise xScale adds complexity to all mouse interactions (hover, click, drag, zoom). Mitigated by encapsulating the mapping in a reusable function.
- **Minimap**: The minimap should also show the compacted view. Or show the full view with break markers. Starting with minimap unchanged (full view) is simpler.
