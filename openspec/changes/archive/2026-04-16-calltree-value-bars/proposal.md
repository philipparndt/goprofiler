## Why

The call tree currently shows self and cumulative values as plain text numbers. It's hard to quickly gauge how much time a function spends in its own code vs delegating to children. A visual bar showing the self/children split -- like JProfiler's hot spot view -- makes it instantly obvious where time is actually spent. Additionally, users need to switch between absolute values (e.g., "120ms") and relative percentages ("15.3%") depending on whether they're comparing functions or understanding overall impact.

## What Changes

- Add a horizontal bar visualization to each call tree row showing the self vs children split (two-color stacked bar)
- Add a toggle to switch the displayed values between absolute (formatted time/bytes) and relative (percentage of total)
- The bar width is proportional to the node's cumulative value relative to the parent (or total, depending on mode)

## Capabilities

### New Capabilities
- `calltree-value-bars`: Inline horizontal bars in the call tree showing self vs children distribution, with absolute/relative value toggle

### Modified Capabilities

_None._

## Impact

- **Modified**: Frontend `CallTree` component in `ProfileViewer.tsx` -- add bar visualization column and value mode toggle
- **No backend changes** -- all data (self, cum, selfPct, cumPct) is already provided by the API
