## Why

Go's built-in `pprof` tooling is powerful but the developer experience is poor -- `go tool pprof` is a CLI-only workflow with static SVGs and clunky navigation. JProfiler set the bar for JVM profiling with a polished GUI, live profiling sessions, and beautiful flame graphs. Go developers deserve the same. GoProfiler brings a modern, browser-based profiling experience to Go applications by connecting to any running pprof endpoint and rendering interactive, high-quality flame graphs in real time.

## What Changes

- New Go backend service (chi router, vlog structured logging) that acts as a proxy/collector for pprof data from remote Go applications
- New React + Radix UI frontend with interactive flame graph visualization, connection management, and profile session controls
- Ability to connect to any Go application exposing a pprof HTTP endpoint (`/debug/pprof`)
- Live profiling sessions with start/stop controls and configurable duration/sample rate
- Multiple profile types: CPU, heap, goroutine, block, mutex
- Beautiful, interactive flame graphs with zoom, search, and detail panels
- Profile history and comparison (diff flame graphs)
- Setup instructions and developer documentation

## Capabilities

### New Capabilities
- `pprof-connection`: Managing connections to remote Go pprof endpoints (connect, disconnect, health check, saved targets)
- `profile-collection`: Starting/stopping profiling sessions, collecting pprof data, supporting multiple profile types (CPU, heap, goroutine, block, mutex)
- `flame-graph-visualization`: Rendering interactive flame graphs from pprof data with zoom, search, highlight, and tooltips
- `profile-management`: Storing, listing, comparing, and exporting collected profiles
- `web-frontend`: React + Radix UI shell with navigation, connection panel, profiling controls, and flame graph viewer

### Modified Capabilities

_None -- this is a greenfield project._

## Impact

- **New codebase**: Go backend + React frontend, no existing code affected
- **Dependencies**: chi, vlog, pprof stdlib, React, Radix UI, a flame graph rendering library (d3-flame-graph or custom canvas/WebGL)
- **APIs**: REST API between frontend and backend for connection management, profiling control, and data retrieval
- **Infrastructure**: Single binary backend serving the SPA frontend; connects outbound to target Go applications' pprof endpoints
