## Why

Go's execution trace is its most powerful diagnostic tool -- it captures goroutine scheduling, syscalls, GC events, and concurrency with nanosecond precision. But `go tool trace` is clunky: it requires a local install, only works in Chrome, has a dated UI based on Chromium's old trace viewer, and provides no integration with the rest of the profiling workflow.

GoProfiler already collects traces. Today it only offers a download button. Building a modern, in-browser trace viewer would be a major differentiator -- making GoProfiler the first tool to provide a polished, integrated trace visualization for Go applications.

## What Changes

### Phase 1: Backend Trace Parsing
- Parse Go traces server-side using `golang.org/x/exp/trace` (the official public API)
- Convert trace events into a JSON structure optimized for frontend rendering
- Expose parsed trace data via REST API

### Phase 2: Goroutine Timeline
- A horizontal timeline showing goroutines as swim lanes
- Each goroutine is a row, with colored segments showing state: Running (green), Runnable (yellow), Blocked (red), Syscall (purple), Waiting (gray)
- Zoom + pan with mouse wheel / drag
- Click a segment to see: goroutine ID, state, duration, stack trace, what it's blocked on

### Phase 3: GC & Heap Overlay
- GC events shown as shaded bands across the timeline
- Heap size chart synced with the timeline
- GC pause durations visible on hover

### Phase 4: Blocking Analysis
- Summary view: top blocking locations by total wait time
- Categories: channel ops, mutex locks, network I/O, syscalls, scheduler latency
- Click to jump to the timeline location

### Phase 5: Processor View
- Show which goroutines ran on which processor (P) over time
- Identify processor imbalance / scheduling bottlenecks

## Capabilities

### New Capabilities
- `trace-timeline`: Interactive goroutine timeline with zoom/pan and state coloring
- `trace-goroutine-analysis`: Per-goroutine state breakdown and transition details
- `trace-gc-visualization`: GC event overlay on timeline with heap chart
- `trace-blocking-analysis`: Blocking summary by category with timeline linking

### Modified Capabilities
- `execution-traces`: Profile viewer shows the trace visualizer instead of just a download card

## Impact

- **New dependency**: `golang.org/x/exp/trace` for parsing
- **New**: `internal/trace/parser.go` -- parse trace binary into structured events
- **New**: `internal/trace/converter.go` -- convert to JSON timeline format
- **New**: `GET /api/profiles/{id}/trace-data` -- returns parsed trace as JSON
- **New**: `frontend/src/components/TraceViewer/` -- multi-component trace viewer
- **Modified**: `ProfileViewer.tsx` -- render TraceViewer for trace profiles instead of download card
- **Performance consideration**: Large traces (50MB+) need streaming/chunked parsing
