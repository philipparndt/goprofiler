## 1. Backend: Availability Detection

- [x] 1.1 Create `internal/expvar/fetcher.go` with a `Probe(ctx, baseURL)` function that issues a GET to `{baseURL}/debug/vars` and returns `(available bool, err error)`
- [x] 1.2 Add `ExpvarAvailable bool` field to `connection.Target` struct (JSON: `expvarAvailable`)
- [x] 1.3 Call `expvar.Probe` in `connection.Store.Connect` and `Reconnect` to set `ExpvarAvailable` on the new target
- [x] 1.4 Update the health check loop in `connection.Store` to re-probe `/debug/vars` each tick and update `ExpvarAvailable` alongside `Status`

## 2. Backend: Expvar Proxy Endpoint

- [x] 2.1 Add `Fetch(ctx, baseURL) (json.RawMessage, time.Time, error)` to `internal/expvar/fetcher.go` that retrieves and returns the raw JSON body from `/debug/vars` along with a timestamp
- [x] 2.2 Add `GET /api/targets/{id}/expvars` route in `handler.go` that calls `Fetch`, wraps the result in `{"timestamp": "...", "metrics": {...}}`, and returns JSON; return 502 if the target is unreachable

## 3. Frontend: Expvar Tab Integration

- [x] 3.1 Update `ConnectionDetail.tsx` to read `target.expvarAvailable` and conditionally render an "Expvar" tab in the tab bar alongside Profiling and Monitor
- [x] 3.2 Add URL-based tab routing for the Expvar tab (e.g., `/connections/{id}/expvars`) consistent with the existing Monitor tab pattern
- [x] 3.3 Add an `api.getExpvars(id)` method to `api.ts` calling `GET /api/targets/{id}/expvars`

## 4. Frontend: Metrics Table Component

- [x] 4.1 Create `ExpvarMetrics` component in `frontend/src/components/ExpvarMetrics.tsx` that accepts a target ID, polls `api.getExpvars` every 2 seconds while mounted, and stops on unmount
- [x] 4.2 Implement type inference: classify each top-level metric value as `number`, `string`, `map` (object), or `raw` (array/null/other)
- [x] 4.3 Render a table with columns: Name, Type, Value, Trend -- displaying the inferred type badge and formatted current value for each metric
- [x] 4.4 Show a stale-data indicator (e.g., dimmed last-updated timestamp) when the most recent poll failed, without clearing previously fetched values

## 5. Frontend: Sparklines

- [x] 5.1 Implement a per-metric ring buffer (max 60 entries) in `ExpvarMetrics` component state; initialise on first poll, append on each subsequent poll, keyed by metric name
- [x] 5.2 Create an inline SVG sparkline (80 × 24 px polyline) rendered in the Trend column for `number`-type metrics, with min/max scaling derived from the ring buffer contents
- [x] 5.3 Render a flat horizontal line for metrics with only one sample (no trend yet)

## 6. Frontend: Expandable Map Rows

- [x] 6.1 Render `map`-type metric rows with a collapsed-by-default chevron toggle showing the count of keys (e.g., "Map (12 keys)")
- [x] 6.2 On expand, render each key/value pair as an indented child row with the same type inference and value formatting as top-level rows
- [x] 6.3 For nested map values within an expanded map, apply the same expand/collapse toggle recursively
