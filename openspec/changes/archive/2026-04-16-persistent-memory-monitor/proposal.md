## Why

Currently, memory monitoring only starts when the user navigates to the Monitor tab, and the data is lost when navigating away or disconnecting/reconnecting. This means you miss early memory behavior after connecting, and a brief network blip that causes a reconnect wipes out your entire monitoring history. Memory monitoring should be always-on for connected targets, collecting data in the background from the moment you connect.

## What Changes

- Move memory monitoring from the frontend to the backend: the backend polls MemStats for all connected targets automatically
- Store the time-series data server-side in memory (per target, ring buffer)
- The frontend fetches the full history on load and receives incremental updates via polling
- Data survives disconnect/reconnect cycles (tied to the target URL, not the connection session)
- Memory monitor tab becomes a view into already-collected data, not a trigger to start collecting

## Capabilities

### New Capabilities
- `persistent-memory-monitor`: Backend-driven continuous MemStats collection for connected targets, with data retained across reconnects

### Modified Capabilities
- `live-memory-chart`: Frontend fetches historical data on load instead of starting from scratch; polling only fetches new points

## Impact

- **New**: `internal/monitor/collector.go` -- background goroutine per target that polls MemStats and stores in ring buffer
- **Modified**: `internal/api/handler.go` -- new endpoint `GET /api/targets/{id}/memstats/history` returns full time-series; existing `/memstats` removed
- **Modified**: `MemoryChart.tsx` -- loads history on mount, appends via polling
- **Modified**: `connection/store.go` -- starts/stops monitor on connect/disconnect
- **No target-side changes**
