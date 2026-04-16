## 1. Backend: Goroutine Count Polling

- [x] 1.1 Create `internal/monitor/goroutine.go` with a `FetchGoroutineCount(client *http.Client, baseURL string) (uint64, error)` function that fetches `/debug/pprof/goroutine?debug=1`, reads only the first line, and parses the count (e.g. `goroutine profile: 84` -> `84`)
- [x] 1.2 Add `NumGoroutines uint64 \`json:"numGoroutines"\`` field to `DataPoint` in `internal/monitor/collector.go`
- [x] 1.3 Extend `pollOnce` in `collector.go` to call `FetchGoroutineCount` and populate `DataPoint.NumGoroutines` (treat fetch failure as 0, do not abort the poll)

## 2. Backend: Goroutine Groups Endpoint

- [x] 2.1 Add `FetchGoroutineGroups(client *http.Client, baseURL string, topN int) (*GoroutineGroupsResponse, error)` to `internal/monitor/goroutine.go` that fetches the full `/debug/pprof/goroutine?debug=1` output (up to 10 MB), parses all groups (count, state, top frame, location, full stack lines), sorts by count descending, and returns the top N
- [x] 2.2 Define `GoroutineGroup` and `GoroutineGroupsResponse` structs in `internal/monitor/goroutine.go`
- [x] 2.3 Add `GET /api/targets/{id}/goroutine-groups` route in `internal/api/handler.go` with an optional `?top=N` query parameter (default 10), calling `FetchGoroutineGroups` via the monitor service's HTTP client

## 3. Frontend: Goroutine Chart Component

- [x] 3.1 Create `frontend/src/components/GoroutineChart.tsx` with a `<canvas>` element rendering a scrolling time-series chart for goroutine count, mirroring the structure of `MemoryChart.tsx`
- [x] 3.2 Draw a single amber line (`#f59e0b`) for goroutine count with a Y axis showing raw integer counts (no byte formatting)
- [x] 3.3 Render a horizontal dashed red threshold line at `GOROUTINE_THRESHOLD` (default 1000); add a constant at the top of the file so it is easy to change
- [x] 3.4 Implement hover crosshair showing timestamp and exact goroutine count
- [x] 3.5 Implement warning badge logic: show "High goroutine count" badge when current count exceeds threshold; show "Goroutine growth detected" badge when last 30 points are monotonically non-decreasing with delta >= 10
- [x] 3.6 Drive the chart from the same `numGoroutines` field in the existing history poll response (no second polling loop needed)

## 4. Frontend: Goroutine Groups Table Component

- [x] 4.1 Create `frontend/src/components/GoroutineGroupsTable.tsx` that renders a table with columns: Count, State, Top Frame, Location
- [x] 4.2 Add a Refresh button that calls `GET /api/targets/{id}/goroutine-groups` and updates the table; display the total goroutine count and the fetch timestamp above the table
- [x] 4.3 Make each row expandable (click to toggle) to show the full stack trace as a `<pre>` block below the row
- [x] 4.4 Show a loading state while the fetch is in progress and an error message if the fetch fails

## 5. Frontend: Monitor Tab Integration

- [x] 5.1 Import `GoroutineChart` and `GoroutineGroupsTable` into `ConnectionDetail.tsx`
- [x] 5.2 Add both components to the Monitor tab section below the existing `<MemoryChart>`, passing `targetId` and `active` props
- [x] 5.3 Add a section heading ("Memory" above `MemoryChart`, "Goroutines" above `GoroutineChart`) so the two charts are visually separated
