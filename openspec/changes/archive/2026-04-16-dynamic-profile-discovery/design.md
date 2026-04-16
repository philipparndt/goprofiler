## Context

The profiler currently hardcodes five profile types in both the backend (`internal/profiler/collector.go` constants: `cpu`, `heap`, `goroutine`, `block`, `mutex`) and the frontend (`ConnectionDetail.tsx`, `api.ts`). Go's `net/http/pprof` handler registers profiles dynamically; the index page at `/debug/pprof/` renders an HTML list of every registered profile and its current item count. Applications can add entries via `pprof.NewProfile("myprofile", 0)`. The existing UI has no way to surface these.

## Goals / Non-Goals

**Goals:**
- Parse the `/debug/pprof/` index to obtain the real list of available profiles for a target
- Expose this as a backend API endpoint
- Use discovered types to populate the frontend profile type selector
- Cache results to avoid repeated HTTP round-trips on every render
- Keep the existing Record (CPU) / Snapshot grouping for well-known types

**Non-Goals:**
- Automatically collect or schedule custom profile types
- Change how profiles are stored or parsed after collection
- Support targets that do not expose `/debug/pprof/`

## Decisions

### 1. Parse the `/debug/pprof/` index HTML

The index page emits anchor tags of the form `<a href="goroutine?debug=1">goroutine</a> (N)` for each profile, plus a separate entry for `profile` (CPU) and `trace`. Parse these with Go's `golang.org/x/net/html` (already pulled in transitively) or a simple regex on the known format. Extract the profile name and the integer count in parentheses.

**Why**: The index page is stable, human-readable, and is the canonical source of truth for what a target exposes. Alternatives (probing each endpoint speculatively) would be slower and fragile.

Profiles returned by the parser:
- `profile` maps to the internal name `cpu` (special-cased -- it is a recording, not a snapshot)
- `trace` is excluded (execution traces are handled separately)
- All others are snapshot types

### 2. New backend endpoint: `GET /targets/{id}/profiles/available`

Returns a JSON array:

```json
[
  { "name": "cpu",       "count": null, "kind": "recording" },
  { "name": "heap",      "count": 4,    "kind": "snapshot" },
  { "name": "goroutine", "count": 12,   "kind": "snapshot" },
  { "name": "block",     "count": 0,    "kind": "snapshot" },
  { "name": "mutex",     "count": 0,    "kind": "snapshot" },
  { "name": "myapp",     "count": 3,    "kind": "snapshot" }
]
```

`kind` is derived server-side: `cpu` → `recording`, everything else → `snapshot`.

**Why a dedicated endpoint rather than embedding in the connection response**: Discovery involves an outbound HTTP call to the target. Keeping it separate lets the UI fetch it lazily and avoids slowing down the connection list load.

### 3. Cache per connection, invalidate on reconnect

Store the discovered profile list in an in-memory map keyed by connection ID. Re-fetch on first request after a connection is added or re-connected. Add a manual refresh button in the UI for convenience.

**Why**: Profiles registered by an app do not change at runtime in practice, so stale cache is acceptable. Avoiding repeated fetches is important because the Connections page re-renders frequently.

### 4. Frontend: dynamic type selector with grouping

On load of the profile type selector (Connections page and the New Profile dialog), call `listAvailableProfiles(targetId)`. While loading, show a spinner in place of the type buttons. Once loaded:

- **Record group**: show `cpu` if present (same as today)
- **Snapshot group**: show `heap`, `goroutine`, `block`, `mutex` if present, plus the "All Snapshots" meta-option if two or more snapshot types are available
- **Custom group**: any discovered names not in the well-known set, labelled by their raw name

Fall back to the current hardcoded list if the discovery endpoint returns an error (target may not expose the index), with a subtle warning indicator.

**Why**: Graceful degradation keeps the app usable against targets that disable the pprof index or run behind a restrictive proxy.

## Risks / Trade-offs

- **HTML parsing fragility**: The `/debug/pprof/` index format is not a versioned API. If Go changes the markup, the parser breaks. Mitigation: write a focused test against the current format and pin it; the fallback to hardcoded types prevents a complete loss of function.
- **Cache staleness**: A target that adds a custom profile after the profiler connects will not show the new type until the user clicks Refresh or reconnects. Acceptable for the typical use case.
- **Extra HTTP request on profile type selector open**: Discovery adds one round-trip. Caching ensures this only happens once per connection session.
