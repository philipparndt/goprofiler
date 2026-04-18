## Why

The flame graph shows incorrect gaps between parent and child frames. For example, `net/http.(*conn).serve` has 0ns self time and 240ms cumulative, but its children don't fully fill its width -- there's a visible gap suggesting self time that doesn't exist.

The root cause: our backend emits `value` as **cumulative** (total samples through that frame), but the frontend configures d3-flame-graph with `.selfValue(true)` which tells it `value` means **self only**. d3-flame-graph then adds up children's "self" values to compute cumulative, producing incorrect widths and gaps.

## What Changes

- Set `.selfValue(false)` in d3-flame-graph configuration so it correctly interprets `value` as cumulative
- This is a one-line fix

## Capabilities

### Modified Capabilities
- `flame-graph-visualization`: Fix incorrect gap rendering by using correct d3-flame-graph value mode

## Impact

- **Modified**: `frontend/src/pages/ProfileViewer.tsx` -- change `.selfValue(true)` to `.selfValue(false)`
- No backend changes
