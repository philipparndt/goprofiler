## 1. Backend: Monitor Service

- [x] 1.1 Create `internal/monitor/collector.go` with `Service` struct: manages per-target polling goroutines, ring buffer storage (keyed by URL), start/stop/cleanup methods
- [x] 1.2 Add `StartTarget(id, url)` and `StopTarget(id)` methods that launch/cancel per-target polling goroutines
- [x] 1.3 Add `GetHistory(url, since)` method returning data points and GC events after a given timestamp

## 2. Backend: Integration

- [x] 2.1 Wire `MonitorService` into `main.go`: create it, pass to handler, start monitoring for initially loaded (reconnected) targets, clean up on shutdown
- [x] 2.2 Call `MonitorService.StartTarget` from connection store's `Connect`/`Reconnect` and `StopTarget` from `Disconnect`
- [x] 2.3 Replace `GET /api/targets/{id}/memstats` with `GET /api/targets/{id}/memstats/history?since=<ts>` that returns buffered data from the service

## 3. Frontend: Load History

- [x] 3.1 Update `MemoryChart` to fetch full history on mount (no `since`), populate ring buffer and GC events from server data
- [x] 3.2 Switch polling to use `since=<lastTimestamp>` for incremental updates, merge new points into existing data
- [x] 3.3 Remove client-side GC detection (server already provides it); accept GC events from the history response
