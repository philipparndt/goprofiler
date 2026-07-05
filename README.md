
<h1 align="center">GoProfiler</h1>

<p align="center">A modern, browser-based profiling tool for Go applications.<br>Connect to any Go app's pprof endpoint and get beautiful flame graphs, call trees, live memory monitoring, execution trace visualization, and more -- all in a single binary.</p>

## Features

**Profiling**
- CPU profiling with flame graphs and call trees
- Heap, goroutine, block, mutex, allocs, and thread creation snapshots
- Execution trace capture with full in-browser visualization
- Dynamic profile discovery -- automatically detects all available profile types including custom ones

**Flame Graphs & Call Trees**
- Interactive flame graphs with zoom, search, and color-by-package/heat modes
- Call tree with self/cumulative time, sample counts, distribution bars
- Sortable top functions table
- Absolute/relative value toggle
- Keyboard navigation (arrow keys, expand/collapse, search)

**Execution Trace Viewer**
- Goroutine swim lane timeline with zoom, pan, and virtual scrolling
- Color-coded goroutine states: running, runnable, blocked, syscall, waiting
- GC event overlay with pause visualization
- Blocking analysis by category (channel, mutex, network, syscall)
- Goroutine summary with state breakdown bars
- Minimap for trace navigation

**Live Monitoring**
- Real-time memory chart (HeapAlloc, HeapSys, Sys) with GC markers
- Live goroutine count chart with threshold warnings
- Goroutine group table with expandable stack traces
- Data persists across page reloads (server-side collection)
- Monitoring starts automatically on connect

**Expvar Metrics**
- Live dashboard for `expvar` metrics
- Auto-detection of expvar availability
- Sparkline trends for numeric metrics
- Expandable nested maps

**Connection Management**
- Connect to any Go app exposing `/debug/pprof/`
- Persistent connections across server restarts
- Process info display (binary name, Go version, OS/arch)
- Dynamic sidebar with per-connection navigation

## Install

### Homebrew (macOS)

```bash
brew install philipparndt/goprofiler/goprofiler
```

This installs the GoProfiler desktop app (signed and notarized). Upgrade later with `brew upgrade --cask goprofiler`.

> Recent Homebrew versions ask you to trust third-party taps first:
> `brew trust philipparndt/goprofiler`

Alternatively, download `GoProfiler-<version>.zip` from the [releases page](https://github.com/philipparndt/goprofiler/releases) and drag `GoProfiler.app` into `/Applications`.

## Quick Start

### Prerequisites

- Go 1.22+
- Node.js 18+ (for building the frontend)

### Build & Run

```bash
# Clone the repository
git clone https://github.com/philipparndt/goprofiler.git
cd goprofiler

# Build everything (frontend + backend)
make build

# Run
./bin/goprofiler
```

Open http://localhost:8080 in your browser.

### Development

```bash
# Run frontend (hot reload) and backend concurrently
make dev
# Frontend: http://localhost:5173 (proxies /api to backend)
# Backend:  http://localhost:8080
```

### CLI Options

```
./bin/goprofiler [options]

  --port       Server port (default: 8080)
  --data-dir   Data directory for profiles (default: ~/.goprofiler)
  --log-level  Log level: trace, debug, info, warn, error (default: info)
```

## Enable pprof in Your Go Application

Add the pprof import to your application:

```go
import _ "net/http/pprof"
```

If you use a custom HTTP mux (chi, gorilla, etc.), start a separate listener:

```go
go func() {
    http.ListenAndServe(":6060", nil)
}()
```

Then connect GoProfiler to `http://localhost:6060`.

### CPU Profile Sampling Rate

Go's CPU profiler samples at 100 Hz by default (10ms granularity). For finer resolution:

```go
runtime.SetCPUProfileRate(500) // 2ms granularity
```

## Architecture

```
goprofiler/
  cmd/goprofiler/       # Main entry point
  internal/
    api/                # REST API handlers
    connection/         # Connection management with JSON persistence
    expvar/             # Expvar metrics fetcher
    flamegraph/         # Flame graph + call tree conversion
    frontend/           # Embedded SPA (built from frontend/)
    monitor/            # Live memory + goroutine monitoring service
    profiler/           # Profile collection + dynamic discovery
    storage/            # SQLite profile storage
    traceparser/        # Go execution trace parser
  frontend/             # React + TypeScript + Vite
    src/
      components/
        MemoryChart     # Canvas-based live memory chart
        GoroutineChart  # Canvas-based live goroutine chart
        ExpvarMetrics   # Expvar metrics dashboard
        TraceViewer/    # Execution trace visualization suite
      pages/
        Dashboard       # Overview with connections + recent profiles
        Connections     # Connection management
        ConnectionDetail # Per-connection profiling, monitoring, info
        ProfileViewer   # Flame graph, call tree, trace viewer
        Setup           # pprof setup instructions
```

Single binary deployment -- the frontend is embedded via `embed.FS`.

## License

MIT
