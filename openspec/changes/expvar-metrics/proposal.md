## Why

Go's `expvar` package lets applications expose named metrics -- counters, gauges, strings, and nested maps -- at `/debug/vars`. These are application-level metrics the developer explicitly publishes: request counts, queue depths, cache hit rates, custom timers. When debugging a running service, seeing these metrics live alongside profiling data is invaluable. Today GoProfiler has no way to surface them. Adding a live expvar metrics dashboard makes GoProfiler a more complete runtime inspection tool, requiring no changes to target applications that already use `expvar`.

## What Changes

- Auto-detect whether the connected target exposes `/debug/vars` on connect; only surface the feature when it does
- Add an "Expvar" tab to the connection detail page (visible only when expvar is available)
- Backend proxies `/debug/vars` from the target and returns it as structured JSON
- Frontend renders a metrics table with live auto-refreshing values (2-second polling)
- Numeric metrics show a sparkline mini-chart capturing recent history (last 60 samples)
- Nested maps are rendered as expandable rows so deeply structured metrics remain navigable

## Capabilities

### New Capabilities
- `expvar-metrics`: Live dashboard of application-defined expvar metrics, with auto-refresh and sparklines for numeric values
- `expvar-detection`: Automatic detection of `/debug/vars` availability on connect; tab is hidden for targets that do not expose it

### Modified Capabilities
- `connection-detail-view`: Add an "Expvar" tab alongside Profiling and Monitor tabs, shown conditionally

## Impact

- **New**: `internal/expvar/fetcher.go` -- fetch and parse `/debug/vars` from a target, detect availability
- **New**: `GET /api/targets/{id}/expvars` -- proxy endpoint returning structured expvar JSON
- **New**: `GET /api/targets/{id}/expvars/available` -- availability probe endpoint
- **New**: Frontend `ExpvarMetrics` component with metrics table, sparklines, and expandable map rows
- **Modified**: `ConnectionDetail.tsx` -- add Expvar tab, conditionally shown based on availability check
- **Modified**: `connection.Target` -- add `ExpvarAvailable bool` field populated on connect and health-check
- **No changes to target applications** -- uses the standard `/debug/vars` endpoint served by `net/http` when `expvar` is imported
