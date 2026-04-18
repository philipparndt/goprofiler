## Why

The memory and goroutine monitor charts currently show a fixed 5-minute window (300 data points at 1s intervals). Users need different time windows depending on what they're investigating: a 1-minute window for real-time debugging, or a 2-hour window for watching long-running trends like slow memory leaks.

## What Changes

- Add a window size selector to the monitor view: 1m, 5m, 15m, 30m, 1h, 2h
- Both the backend ring buffer and frontend chart adapt to the selected window
- Backend: increase the ring buffer to support the largest window (2h = 7200 points at 1s)
- Frontend: the chart only displays data within the selected window, trimming older points from view

## Capabilities

### Modified Capabilities
- `live-memory-chart`: Configurable time window for the memory chart
- `goroutine-monitor`: Same window applies to the goroutine chart (both charts share the setting)

## Impact

- **Modified**: Backend `internal/monitor/collector.go` -- increase `MaxPoints` to 7200
- **Modified**: Frontend `MemoryChart.tsx` -- accept window prop, trim displayed data
- **Modified**: Frontend `GoroutineChart.tsx` -- same
- **Modified**: Frontend `ConnectionDetail.tsx` -- add window selector, pass to both charts
