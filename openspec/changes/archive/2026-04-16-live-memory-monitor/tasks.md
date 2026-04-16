## 1. Backend: MemStats Endpoint

- [x] 1.1 Create `internal/monitor/memstats.go` that fetches `/debug/pprof/heap?debug=1` from a target URL and parses MemStats fields (HeapAlloc, HeapSys, Sys, NumGC, PauseTotalNs, LastPauseNs, LastGC)
- [x] 1.2 Add `GET /api/targets/{id}/memstats` endpoint in handler.go that calls the parser and returns JSON

## 2. Frontend: Memory Chart Component

- [x] 2.1 Create `MemoryChart` component with a `<canvas>` element that renders a scrolling time-series chart with configurable line series
- [x] 2.2 Implement the ring buffer data store (last 300 points) and 1-second polling loop using the memstats API
- [x] 2.3 Draw three lines (HeapAlloc green, HeapSys blue, Sys gray) with Y-axis labels in human-readable format (KB/MB/GB)
- [x] 2.4 Implement hover crosshair showing timestamp and exact values for all three metrics
- [x] 2.5 Add chart legend with live current values

## 3. Frontend: GC Markers

- [x] 3.1 Detect GC events by comparing NumGC between consecutive polls, store GC timestamps and pause durations
- [x] 3.2 Render vertical dashed lines on the chart at GC timestamps with tooltips on hover
- [x] 3.3 Display GC stats summary below the chart (count, avg pause, total pause)

## 4. Frontend: Connection Detail Integration

- [x] 4.1 Add "Monitor" tab to ConnectionDetail page that shows the MemoryChart when active, starts/stops polling on tab switch
