## Context

The current memory monitor is fully frontend-driven: the `MemoryChart` component polls `GET /api/targets/{id}/memstats` every second, maintains a ring buffer in React state, and loses everything on unmount or page navigation. The backend is stateless -- each call fetches from the target and returns immediately.

## Goals / Non-Goals

**Goals:**
- Backend polls MemStats automatically for every connected target (1s interval)
- Ring buffer stored server-side (last 300 points = 5 min)
- Data keyed by target URL so it survives disconnect/reconnect
- Frontend loads full history on mount, then polls for incremental updates
- No manual start/stop -- always collecting while connected

**Non-Goals:**
- Persist MemStats to disk (in-memory only, lost on server restart)
- WebSocket streaming (polling is fine at 1s)

## Decisions

### 1. Backend `MonitorService` with per-target goroutines

A `MonitorService` struct manages a map of target URL -> goroutine. When a target connects, a goroutine starts polling. On disconnect, the goroutine stops but the data is retained. On reconnect, the goroutine resumes and appends to the existing buffer.

**Why**: Simple lifecycle. The connection store already has connect/disconnect hooks. Data retention is natural since it's keyed by URL.

### 2. API: `GET /api/targets/{id}/memstats/history?since=<timestamp>`

Returns the full ring buffer (or points after `since` for incremental polling). The frontend fetches without `since` on mount (gets everything), then polls with `since=<lastTimestamp>` to get only new points.

**Why**: Single endpoint for both initial load and incremental updates. The `since` parameter keeps responses small during polling.

### 3. Integration: MonitorService started from main.go, passed to handler

The `MonitorService` is created in `main.go` and passed to the API handler. The connection store notifies it on connect/disconnect via a callback interface.

**Why**: Clean dependency injection. The monitor doesn't need to know about HTTP routing.

## Risks / Trade-offs

- **Memory usage for many targets** -> 300 points * ~100 bytes * N targets. Even 100 targets = ~3MB. Negligible.
- **Goroutine leak** -> Mitigated by context cancellation on disconnect and a cleanup on server shutdown.
