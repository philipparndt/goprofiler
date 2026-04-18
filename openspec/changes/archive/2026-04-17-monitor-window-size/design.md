## Context

The backend `MonitorService` stores data in a ring buffer of `MaxPoints=300` (5 min). The frontend fetches full history and polls every 1s. Both `MemoryChart` and `GoroutineChart` use a local `MAX_POINTS=300` to trim their data.

## Decisions

### 1. Increase backend buffer to 7200 (2 hours)

Set `MaxPoints=7200` in `collector.go`. This means the backend always retains up to 2 hours of data. Memory cost: ~7200 * ~100 bytes * N targets = ~700KB per target. Negligible.

### 2. Frontend window selector as buttons

A row of buttons in the monitor tab: `[1m] [5m] [15m] [30m] [1h] [2h]`. Default: 5m. The selected window determines how much data the charts display -- they trim to only show data within `now - windowMs`.

### 3. Charts receive `windowMs` prop

Both `MemoryChart` and `GoroutineChart` accept a `windowMs` prop. They keep all data from the server in their ref but only render the last `windowMs` milliseconds.

### 4. Shared state in ConnectionDetail

The window selector lives in ConnectionDetail's monitor tab, above both charts. A single `windowMinutes` state controls both.

## Risks / Trade-offs

- **Increased backend memory** -- 24x more points per target. Still negligible (~700KB per target).
- **Larger API responses** -- initial fetch may return up to 7200 points. Still small (~700KB JSON).
