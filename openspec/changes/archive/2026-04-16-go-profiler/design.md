## Context

This is a greenfield project building a browser-based Go profiling tool. Go ships with `net/http/pprof` which exposes profiling data over HTTP, and `runtime/pprof` / `go tool pprof` for analysis. The raw data is in protobuf format (pprof profile.proto). Today, developers use `go tool pprof` CLI or paste profiles into external tools. There is no integrated, visually polished GUI experience comparable to JProfiler (JVM) or Instruments (macOS).

The backend is a Go service using chi for routing and vlog for structured logging (matching the team's existing stack). The frontend is a React SPA using Radix UI primitives. The backend serves the SPA and acts as a proxy -- it connects to target Go applications' `/debug/pprof` endpoints, collects profile data, and exposes it to the frontend via a REST API.

## Goals / Non-Goals

**Goals:**
- Connect to any Go application exposing standard pprof HTTP endpoints
- Collect CPU, heap, goroutine, block, and mutex profiles
- Render beautiful, interactive flame graphs with zoom, search, and detail tooltips
- Provide a polished single-binary developer tool (backend serves frontend)
- Support profile history and diff/comparison views
- Fast setup: single `go install` or binary download

**Non-Goals:**
- Continuous production monitoring / alerting (this is a developer tool, not an APM)
- Support for non-Go profiling formats (perf, jfr, etc.) -- pprof only for v1
- User authentication / multi-tenancy
- Remote/cloud deployment (local-first tool)
- Trace-level instrumentation or distributed tracing

## Decisions

### 1. Single binary architecture (backend serves SPA)

The Go backend embeds the built React frontend via `embed.FS` and serves it at `/`. API routes live under `/api/`.

**Why**: Single binary distribution is the gold standard for Go developer tools. No separate frontend server, no CORS, trivial installation. Developers run one command and open a browser.

**Alternatives considered**: Separate frontend dev server + backend (rejected: complicates distribution), Electron app (rejected: too heavy for a profiling tool).

### 2. pprof data collection via HTTP proxy

The backend fetches profiles from target applications by making HTTP requests to their `/debug/pprof/*` endpoints. For CPU profiles, it hits `/debug/pprof/profile?seconds=N`. For heap/goroutine/block/mutex, it fetches the corresponding endpoints.

**Why**: This is how pprof works -- the endpoints are already there in any Go app that imports `net/http/pprof`. No agent or sidecar needed on the target.

**Alternatives considered**: gRPC streaming from targets (rejected: requires instrumenting targets), eBPF-based profiling (rejected: massive scope increase, OS-specific).

### 3. Profile parsing with `google/pprof` library

Use the `github.com/google/pprof` Go library to parse protobuf profile data into structured form. The backend converts pprof profiles into a JSON flame graph structure that the frontend can render directly.

**Why**: This is the canonical pprof parser, used by `go tool pprof` itself. Battle-tested, handles all profile types, and provides merging/filtering utilities.

### 4. Frontend flame graph rendering with d3-flame-graph

Use `d3-flame-graph` (built on D3.js) for flame graph rendering, with custom styling to achieve a premium visual experience.

**Why**: Mature, well-maintained library with built-in zoom, search, and tooltips. Extensible enough for custom color schemes and interactions. Canvas/WebGL would be faster for huge profiles but adds complexity -- start with SVG/d3 and optimize later if needed.

**Alternatives considered**: Custom canvas renderer (rejected for v1: high effort), speedscope integration (rejected: different focus, hard to embed cleanly).

### 5. Profile storage: local filesystem

Collected profiles are stored as files on the local filesystem in a data directory (`~/.goprofiler/profiles/`). Metadata (target, timestamp, type, duration) is stored in a JSON sidecar or SQLite database.

**Why**: Local-first tool, no database server dependency. Profiles are protobuf files that compress well. SQLite gives queryable metadata without setup cost.

**Alternatives considered**: In-memory only (rejected: lose profiles on restart), embedded key-value store like bbolt (rejected: SQLite is more flexible for queries).

### 6. Chi router + vlog logging

Use `github.com/go-chi/chi/v5` for HTTP routing and `vlog` for structured logging, matching the team's established patterns.

**Why**: Consistency with existing projects. Chi is lightweight and idiomatic. Vlog provides structured JSON logging with level control.

### 7. React + Radix UI for frontend

Use React with Radix UI primitives for the component library, providing accessible, unstyled primitives that we style to create a premium dark-themed profiler UI.

**Why**: Radix provides high-quality accessible primitives (dialogs, dropdowns, tabs, tooltips) without imposing a visual style. This lets us create a distinctive, polished look. Dark theme is standard for developer tools.

## Risks / Trade-offs

- **Large CPU profiles can be slow to render as SVG** -> Mitigation: Implement client-side truncation (collapse frames below a threshold), add a "top N frames" filter. Plan for canvas renderer in future version.
- **Target application must expose pprof HTTP endpoint** -> Mitigation: Provide clear setup instructions. Most Go web servers already have this or it's a one-line import. Offer a helper snippet.
- **Network connectivity to target** -> Mitigation: Clear error messages when connection fails. Support for SSH tunneling documentation.
- **Profile data can be large (10s of MB for long CPU profiles)** -> Mitigation: Stream profile data, compress stored profiles, paginate profile list.
- **SQLite CGo dependency** -> Mitigation: Use `modernc.org/sqlite` (pure Go SQLite) to maintain single-binary cross-compilation.
