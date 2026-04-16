## Context

Go execution traces are binary files containing nanosecond-precision events about goroutine scheduling, GC, syscalls, and I/O. The official `golang.org/x/exp/trace` package provides a public streaming reader API. `go tool trace` converts these internally to Chrome Trace Event Format for rendering, but the conversion code is in `internal/` and not reusable.

Our approach: parse traces server-side with `golang.org/x/exp/trace`, convert to a custom JSON format optimized for our UI, and render with a custom canvas-based timeline in the browser.

## Goals / Non-Goals

**Goals:**
- Parse Go traces (v2 format, Go 1.22+) server-side
- Render an interactive goroutine timeline with zoom/pan
- Show GC events, blocking analysis, and processor view
- Handle traces up to ~50MB (5-10 second captures)
- Modern, responsive UI that's better than `go tool trace`

**Non-Goals:**
- Support for Go trace v1 format (pre-1.22) -- too old, use `go tool trace` for those
- Real-time streaming trace visualization (traces are always recorded then viewed)
- Chrome Trace Event Format / Perfetto compatibility (we build our own viewer)

## Decisions

### 1. Server-side parsing with `golang.org/x/exp/trace`

Use the official public trace reader API. Parse the entire trace into an in-memory event list, then convert to our JSON format. Cache the parsed result per profile ID.

**Why**: 
- Only public Go trace parsing library
- Streaming API handles large files efficiently
- Server-side parsing means zero WASM/JS complexity for binary format handling

### 2. Custom JSON format for frontend

Convert trace events into a JSON structure with:

```json
{
  "meta": {
    "duration": 5000000000,    // total trace duration in ns
    "goroutineCount": 84,
    "processorCount": 8
  },
  "goroutines": [
    {
      "id": 1,
      "name": "main.main",
      "spans": [
        {
          "start": 0,
          "end": 1000000,
          "state": "running",
          "processor": 0,
          "stack": ["main.main", "runtime.main"]
        },
        {
          "start": 1000000,
          "end": 2000000,
          "state": "blocked",
          "reason": "chan receive",
          "stack": ["main.worker", "runtime.chanrecv1"]
        }
      ]
    }
  ],
  "gcEvents": [
    {
      "start": 3000000,
      "end": 3500000,
      "type": "gc",
      "pauseNs": 500000
    }
  ],
  "processors": [
    {
      "id": 0,
      "spans": [
        { "start": 0, "end": 1000000, "goroutineId": 1 }
      ]
    }
  ],
  "blockingSummary": [
    {
      "location": "runtime.chanrecv1",
      "category": "channel",
      "totalDuration": 15000000,
      "count": 42,
      "stack": ["main.worker", "runtime.chanrecv1"]
    }
  ]
}
```

**Why**: Custom format lets us optimize for our specific UI needs. No dependency on Chrome trace format. Single API call returns everything the frontend needs.

### 3. Canvas-based timeline renderer

The timeline is a `<canvas>` element (not SVG/DOM) with:
- Horizontal axis = time, vertical axis = goroutines (swim lanes)
- Colored rectangles for goroutine state spans
- Zoom via mouse wheel, pan via drag
- Virtual scrolling for large goroutine counts (only render visible rows)

```
Time ──────────────────────────────────────────►
G1  ████████░░░░░████████████░░████████████████
G2  ░░░░░░░░████████░░░░░░░░░░░░████████░░░░░░
G3  ░░░░████████████████████░░░░░░░░████████░░░
G4  ████░░░░░░░░░░████░░░░████████████░░░░░░░░░
     GC ▓▓▓▓▓                    GC ▓▓▓
```

Color scheme:
- Running: `#22c55e` (green)
- Runnable: `#f59e0b` (amber -- queued, waiting for CPU)
- Blocked: `#ef4444` (red -- channel, mutex, etc.)
- Syscall: `#8b5cf6` (purple)
- Waiting: `#6b7280` (gray -- I/O, sleep, etc.)
- GC bands: `rgba(239, 68, 68, 0.15)` (light red overlay)

**Why**: Canvas handles thousands of rectangles at 60fps. SVG/DOM would choke on large traces. Virtual scrolling keeps memory bounded.

### 4. Phased implementation

Build in layers so each phase delivers standalone value:
1. Parse + goroutine timeline (core feature)
2. GC overlay + heap chart (enhances understanding)
3. Blocking analysis (actionable insights)
4. Processor view (advanced debugging)

**Why**: The timeline alone is massively valuable. Each subsequent phase adds depth without blocking the core.

### 5. Trace data caching

Cache parsed trace JSON in memory (keyed by profile ID). Traces are immutable once collected, so the cache never invalidates. Evict on profile deletion.

**Why**: Parsing is expensive (seconds for large traces). Users may switch tabs and come back.

## Risks / Trade-offs

- **Large trace files** -> 50MB trace = ~seconds to parse. Show a progress indicator. Consider a size limit warning.
- **Many goroutines** -> Virtual scrolling + collapsible goroutine groups mitigate this. Show top-N by activity with expand-all option.
- **`golang.org/x/exp/trace` API stability** -> It's "experimental" but the Go team uses it in `go tool trace`. Low risk.
- **Canvas complexity** -> Custom renderer is significant code but necessary for performance. Consider using an existing canvas library (e.g., PixiJS) if complexity grows.
