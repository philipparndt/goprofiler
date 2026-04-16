## Context

Go's `/debug/pprof/heap?debug=1` returns human-readable text that includes a full `runtime.MemStats` dump at the bottom. This contains HeapAlloc, HeapSys, Sys, NumGC, PauseNs, PauseTotalNs, and LastGC -- everything we need for live monitoring without requiring any changes to the target application.

## Goals / Non-Goals

**Goals:**
- Poll MemStats every 1-2 seconds from connected targets
- Display a scrolling time-series chart (last 5 minutes by default)
- Show lines for HeapAlloc, HeapSys, Sys
- Mark GC events with vertical lines and pause time tooltips
- Detect new GC events by comparing NumGC between polls

**Non-Goals:**
- WebSocket/SSE streaming (polling is sufficient at 1-2s intervals)
- Historical MemStats storage (live view only, not persisted)
- Object allocation tracking or allocation profiling (that's the heap snapshot)

## Decisions

### 1. Parse `/debug/pprof/heap?debug=1` for MemStats

The heap debug output contains lines like `# HeapAlloc = 1234567` at the bottom. Parse these with simple string matching.

**Why**: No target-side changes needed. Every Go app with `net/http/pprof` imported already serves this. Simpler than requiring `expvar` or a custom endpoint.

### 2. Backend polling endpoint: `GET /api/targets/{id}/memstats`

A stateless endpoint that fetches `/debug/pprof/heap?debug=1` from the target, parses MemStats, and returns JSON. The frontend polls this endpoint.

**Why**: Keep the backend simple and stateless. The frontend maintains the time-series buffer. No goroutines or memory tracking on the backend.

### 3. Frontend canvas-based chart

Use a `<canvas>` element for the scrolling chart. Draw lines for each metric, a time axis, and vertical GC markers. The frontend keeps a ring buffer of the last N data points (e.g., 300 at 1s intervals = 5 minutes).

**Why**: Canvas is performant for real-time updates at 1Hz. SVG/D3 would create too many DOM nodes for a scrolling chart. A simple custom canvas renderer is lightweight and gives full control.

### 4. GC detection via NumGC delta

Each poll returns the current `NumGC` count. If it increases between polls, a GC happened. The `PauseNs` array (circular buffer of last 256 GC pauses) gives the pause duration.

**Why**: Simple and reliable. No need for complex event tracking.

### 5. MemStats JSON response shape

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "heapAlloc": 1234567,
  "heapSys": 2345678,
  "sys": 3456789,
  "numGC": 42,
  "pauseTotalNs": 123456789,
  "lastPauseNs": 1234567,
  "lastGC": "2024-01-15T10:29:58Z"
}
```

## Risks / Trade-offs

- **Polling overhead on target** -> `/debug/pprof/heap?debug=1` is lightweight (no full heap scan, just reads runtime.MemStats). 1s polling is fine.
- **Chart performance with many data points** -> Canvas + ring buffer caps at 300 points. Older data scrolls off.
- **PauseNs is a circular buffer of 256** -> If more than 256 GCs happen between polls (extremely unlikely at 1s polling), some pause data is lost.
