## Context

Go's `expvar` package registers a handler at `/debug/vars` on `http.DefaultServeMux` that returns a JSON object. Each key is a metric name; values are either a number (`float64`), a string, or a JSON object (for `expvar.Map`). Maps can be nested arbitrarily. Not all Go services use `expvar` -- only those that have imported the package (directly or via a dependency). The endpoint is unauthenticated and returns the same JSON shape every time, making it safe to poll.

## Goals / Non-Goals

**Goals:**
- Proxy `/debug/vars` from the target through the GoProfiler backend to avoid CORS issues
- Detect availability at connect time and during health checks; surface detection state in the `Target` struct
- Render all top-level metrics in a table: name, type, current value
- For numeric metrics, maintain a ring buffer of the last 60 samples and render a sparkline
- Expand `expvar.Map` values inline with one level of nesting visible by default; deeper levels collapse by default
- Poll at 2-second intervals when the Expvar tab is active; stop polling when the tab is inactive

**Non-Goals:**
- Persisting expvar history across page reloads or reconnections
- Alerting or thresholds on metric values
- Filtering or searching metrics (the list is typically small)
- Rendering non-JSON expvar values (the `expvar.Func` type can return arbitrary JSON; treat unknown shapes as raw strings)

## Decisions

### 1. Availability detection: HEAD request to `/debug/vars`

On `Connect` and during the health check loop, issue a `HEAD` (or cheap `GET`) to `{targetURL}/debug/vars`. If it returns 200, set `ExpvarAvailable: true` on the `Target`. Store this alongside the existing `Status` field.

**Why**: Cheap per-health-check probe. The flag travels with the `Target` JSON so the frontend knows immediately whether to render the tab without a separate round-trip.

### 2. Backend proxy endpoint: `GET /api/targets/{id}/expvars`

Fetch `{targetURL}/debug/vars`, parse the JSON, and return it verbatim (or lightly structured). No transformation needed; the frontend owns rendering logic.

**Why**: Keeps the backend thin and stateless. Avoids duplicating expvar's own JSON serialization. The frontend can handle all display concerns including type inference.

### 3. Type inference on the frontend

The `expvar` JSON format gives no type hints beyond JSON primitives. The frontend infers metric type from the JSON value:
- `number` (JSON float64) -> numeric; eligible for sparkline
- `string` -> string metric; display as-is
- `object` -> `expvar.Map`; render as expandable nested rows
- `array` or other -> display as raw JSON string (rare; `expvar.Func` edge case)

**Why**: No schema is available at the backend level. Type inference from the JSON value shape is reliable for all standard expvar types.

### 4. Sparklines via inline SVG

Each numeric row renders a small inline `<svg>` sparkline (e.g., 80 × 24 px) using a simple polyline drawn from the ring buffer. No charting library needed.

**Why**: Sparklines are simple enough to draw with a few lines of SVG math. Avoids adding a chart library dependency for what is essentially a decorative trend indicator.

### 5. Ring buffer on the frontend

Each numeric metric key maps to a `number[]` ring buffer of the last 60 values (capped). The frontend initialises the buffer on first poll and appends each subsequent sample. Buffers are keyed by metric name and reset on reconnect or tab unmount.

**Why**: Simple, zero-dependency state management. 60 samples at 2s = 2 minutes of trend history, which is enough to see direction without consuming memory.

### 6. Map expansion state

Top-level `expvar.Map` entries are collapsed by default (show count of keys). A chevron toggle expands them inline to show key/value rows. Nested maps within a map also have toggles.

**Why**: Some applications expose large maps (e.g., per-route counters). Defaulting to collapsed keeps the table readable.

### 7. Expvar JSON response shape

The backend returns the raw JSON object from `/debug/vars` with a wrapping envelope:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "metrics": {
    "cmdline": ["./myapp"],
    "memstats": { ... },
    "requests_total": 1234,
    "cache_hit_rate": 0.87,
    "build_info": "v1.2.3"
  }
}
```

The `cmdline` and `memstats` keys are always present (registered by the `expvar` package itself). The frontend displays all keys; future work could optionally suppress the built-in ones.

## Risks / Trade-offs

- **`expvar.Func` returns arbitrary JSON** -> Unknown shapes fall back to raw JSON string display. Acceptable; uncommon in practice.
- **Large `memstats` map** -> The built-in `memstats` expvar is a large nested object. The expansion toggle keeps it from dominating the view.
- **2-second polling adds load** -> `/debug/vars` is a cheap in-memory read with no I/O. 2-second polling is negligible even on high-traffic services.
- **No expvar on non-default mux** -> Some services register pprof on a non-default mux but expvar on default, or vice versa. The probe handles this cleanly: if `/debug/vars` is unreachable, the tab is simply hidden.
