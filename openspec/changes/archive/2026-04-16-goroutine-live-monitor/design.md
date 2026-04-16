## Context

Go's `/debug/pprof/goroutine?debug=1` returns human-readable text. The very first line is:

```
goroutine profile: N
```

where N is the current goroutine count. The rest of the file contains one group per unique stack, with a header like:

```
42 @ 0x... 0x...
goroutine 12 [chan receive]:
main.worker(...)
    /app/main.go:42
```

The count prefix on each group (e.g. `42`) is the number of goroutines sharing that stack. This is all we need for both the live count chart and the grouping table.

The existing `FetchMemStats` call already hits `/debug/pprof/heap?debug=1` every second. Goroutine count is not present in that output, so a separate fetch against the goroutine endpoint is required. To keep polling lightweight we fetch goroutine count from the goroutine endpoint (one extra HTTP request per second) and parse the count from the first line only. The full goroutine grouping parse is done only on demand when the user requests the groups table.

## Goals / Non-Goals

**Goals:**
- Add goroutine count to the per-second polling data alongside MemStats
- Display a scrolling time-series chart for goroutine count using the same canvas pattern as `MemoryChart`
- Show a visual warning when count exceeds a threshold (default 1000) or when the trend is monotonically increasing over the last 30 data points
- Provide an on-demand goroutine stack grouping table (top 10 groups by count) refreshed manually or on a slower cadence

**Non-Goals:**
- WebSocket/SSE streaming (1s polling is sufficient)
- Persisting goroutine history to the database
- Automatic threshold configuration per-target (a sensible global default is enough)

## Decisions

### 1. Fetch goroutine count from `/debug/pprof/goroutine?debug=1`

Parse only the first line of the response for the live count. This is a plain text HTTP GET that completes in microseconds on the target.

**Why**: The heap debug output (`/debug/pprof/heap?debug=1`) does not include goroutine count. Fetching from the goroutine endpoint is the cleanest source. The request is lightweight because the full response body is not read for the count-only case -- we stop reading after the first line using `bufio.Scanner`.

**Alternative considered**: Reading the full response and parsing it for both count and grouping in one shot. Rejected because the full goroutine dump can be large (thousands of goroutines) and parsing it every second for a single number is wasteful.

### 2. Extend `DataPoint` with `NumGoroutines uint64`

Add the field to the existing struct. This keeps the polling loop unified (one tick drives both memstats and goroutine count fetches in parallel) and the history endpoint returns everything in one response.

**Why**: The frontend already polls `GET /api/targets/{id}/memstats/history`. Adding goroutine count to the same response avoids a second polling loop on the frontend and keeps chart synchronisation trivial (both charts share the same time axis).

### 3. Separate on-demand endpoint for goroutine grouping

`GET /api/targets/{id}/goroutine-groups` fetches `/debug/pprof/goroutine?debug=1`, parses all groups, sorts by count descending, and returns the top N (default 10).

Response shape:

```json
{
  "total": 84,
  "timestamp": "2026-04-16T10:30:00Z",
  "groups": [
    {
      "count": 42,
      "state": "chan receive",
      "topFrame": "main.worker",
      "location": "/app/main.go:42",
      "stack": ["main.worker\n\t/app/main.go:42", "..."]
    }
  ]
}
```

**Why**: Parsing the full goroutine dump at 1Hz would be expensive on targets with many goroutines. On-demand or slower-cadence (e.g., refresh button + auto-refresh every 10s) keeps the overhead acceptable. The live count chart already shows whether something is wrong; the groups table is for diagnosis once a problem is spotted.

### 4. Warning indicator logic

Two independent conditions trigger a warning badge on the goroutine chart:

- **Threshold breach**: current count > threshold (default 1000, shown as a horizontal dashed line on the chart)
- **Sustained growth**: the last 30 data points form a monotonically non-decreasing sequence (or a simple linear regression with a positive slope above a minimum delta)

**Why**: A spike that resolves itself (e.g., a burst of work) should not keep showing a warning. The sustained growth check is more meaningful for leak detection.

### 5. Frontend component structure

- `GoroutineChart` -- canvas component mirroring `MemoryChart`. Single line (goroutine count, amber color). Y axis shows raw count (not bytes). Threshold line as horizontal dashed red. Warning badge in top-right corner of the card.
- `GoroutineGroupsTable` -- simple table component. Refresh button + auto-refresh toggle. Expandable rows to show full stack trace.
- Monitor tab in `ConnectionDetail` renders: `<MemoryChart>` followed by `<GoroutineChart>` followed by `<GoroutineGroupsTable>`.

### 6. Polling loop change in `collector.go`

The existing `pollOnce` method calls `FetchMemStats`. Extend it to also call a `FetchGoroutineCount` helper and store the result in `DataPoint.NumGoroutines`. Both fetches run sequentially in the same goroutine -- the overhead is negligible.

## Risks / Trade-offs

- **Extra HTTP request per second to target**: One additional GET per connected target at 1s intervals. The target-side cost of `/debug/pprof/goroutine?debug=1` with early read termination is minimal.
- **Large goroutine dumps**: If a target has tens of thousands of goroutines the full debug output for the grouping endpoint can be several MB. The backend should apply a size cap (e.g., read at most 10 MB) and the top-N truncation limits response size.
- **Growth detection false positives**: A long-running idle application may show a slowly growing goroutine count that is perfectly normal (e.g., scheduled timers). The 30-point window and minimum delta threshold reduce false positives but do not eliminate them entirely.
