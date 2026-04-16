## Context

The pprof HTTP server exposes `/debug/pprof/cmdline` which returns the process command line as a null-byte-delimited (or newline-delimited) list of arguments. Build metadata -- Go version, GOOS, GOARCH -- is available from `/debug/pprof/heap?debug=1` in the header comments, or alternatively from `/debug/pprof/symbol` or the build info endpoint if available. The connection detail page already has a status bar; process info fits naturally alongside the URL and status badge, giving immediate context about the profiling target.

## Goals / Non-Goals

**Goals:**
- Fetch command line args from the target's `/debug/pprof/cmdline`
- Parse Go version, GOOS, GOARCH from `/debug/pprof/heap?debug=1` response header lines
- Single backend endpoint `GET /api/targets/{id}/process-info` that aggregates this data
- Display in the connection detail status bar: binary + args, Go version, OS/arch
- Fetch once on connection detail page load; no continuous polling

**Non-Goals:**
- Watching for process restarts or cmdline changes over time
- Exposing environment variables or other process metadata beyond what pprof provides
- Caching process info server-side across reconnects

## Decisions

### 1. New endpoint `GET /api/targets/{id}/process-info`

A dedicated endpoint that makes two requests to the target: one to `/debug/pprof/cmdline` for the command line, and one to `/debug/pprof/heap?debug=1` to extract build info from the response text. Returns a single JSON object with `cmdline`, `goVersion`, `goos`, and `goarch` fields.

**Why**: Keeps the fetching logic server-side (no CORS issues from the browser hitting the target directly). Mirrors the pattern already used for memstats and profiling -- the backend proxies all target communication.

### 2. Parse build info from heap debug output

The `/debug/pprof/heap?debug=1` response includes comment lines like `# runtime.MemStats` and a header block containing `# runtime/debug.ReadBuildInfo` output with `go` version, `GOOS`, and `GOARCH`. These are parsed with simple string scanning -- no full pprof parse needed for just the header fields.

**Why**: This is the most reliable source available on any Go pprof server without requiring additional endpoints. The format is stable across Go versions. An alternative is `/debug/pprof/` index page, but heap debug output is more structured for this purpose.

### 3. Frontend: inline display in the connection detail status bar

Process info is fetched in `ConnectionDetail.tsx` via a `useEffect` on mount (when `target.status === "connected"`). The result is rendered as a small secondary line under the URL/status, showing the executable name (last path segment of `cmdline[0]`), Go version, and `GOOS/GOARCH`. Full cmdline args are shown as a truncated monospace string with a title tooltip for the full value.

**Why**: The status bar already has a two-line layout (URL on top, status badge below). A third line of compact metadata adds context without requiring a new section or tab. The info is secondary -- it should not dominate the visual hierarchy.

### 4. Graceful degradation

If the endpoint fails (target does not expose heap debug, or the process info endpoint returns an error), the UI simply omits the process info display -- no error state is shown. The feature is purely informational.

**Why**: Not all pprof targets expose all endpoints. A failure to fetch process info should never block the core profiling workflow.

## Risks / Trade-offs

- **Heap debug parse fragility** -> If Go changes the heap debug output format, the parser may miss fields. Mitigated by treating all fields as optional and returning whatever can be parsed.
- **Extra latency on page load** -> Two additional HTTP requests to the target on connection detail open. Both are fast (cmdline is a few bytes; heap debug header is small). Fetched in parallel, not blocking profile load.
