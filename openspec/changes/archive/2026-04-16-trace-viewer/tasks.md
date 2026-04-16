## 1. Backend: Trace Parser

- [x] 1.1 Add `golang.org/x/exp/trace` dependency to go.mod
- [x] 1.2 Create `internal/traceparser/parser.go` with `ParseTrace(data []byte) (*TraceData, error)` that reads trace events using `trace.NewReader` and builds the structured data
- [x] 1.3 Define `TraceData` struct with: `Meta` (duration, goroutine count, processor count), `Goroutines` (id, name, spans with state/start/end/stack), `GCEvents` (start, end, pause), `Processors` (id, spans with goroutine IDs)
- [x] 1.4 Build goroutine span list by tracking state transitions per goroutine ID from `EventStateTransition` events
- [x] 1.5 Extract GC events from `EventRangeBegin`/`EventRangeEnd` with GC type ranges
- [x] 1.6 Build blocking summary: aggregate blocking durations by location (stack top) and category (channel/mutex/network/syscall/scheduler)
- [x] 1.7 Build processor spans from processor state transitions

## 2. Backend: Trace API

- [x] 2.1 Add `GET /api/profiles/{id}/trace-data` endpoint that parses the trace (or returns cached result) and responds with the JSON structure
- [x] 2.2 Add in-memory trace cache (map from profile ID to parsed TraceData) with eviction on profile deletion
- [x] 2.3 Return appropriate error for non-trace profiles and parse failures

## 3. Frontend: Trace Viewer Shell

- [x] 3.1 Create `frontend/src/components/TraceViewer/TraceViewer.tsx` as the top-level component with tab navigation: Timeline, Goroutines, GC, Blocking
- [x] 3.2 Fetch trace data from `GET /api/profiles/{id}/trace-data` on mount, show loading/progress state
- [x] 3.3 Replace the download card in `ProfileViewer.tsx` with `TraceViewer` component (keep download button in the header)

## 4. Frontend: Timeline Canvas Renderer

- [x] 4.1 Create `TraceTimeline.tsx` with a `<canvas>` element and viewport state (viewStart, viewEnd in nanoseconds, scrollTop for vertical position)
- [x] 4.2 Render goroutine rows as swim lanes: left label area (goroutine ID + name) and right canvas area with colored state rectangles
- [x] 4.3 Implement zoom (mouse wheel changes viewStart/viewEnd centered on cursor) and pan (mouse drag shifts viewStart/viewEnd)
- [x] 4.4 Implement virtual scrolling: only render goroutine rows visible in the viewport, calculate visible range from scrollTop and row height
- [x] 4.5 Render time axis at the top with tick marks and labels (auto-scale units: ns/us/ms/s)
- [x] 4.6 Implement click-to-select: clicking a span shows a detail panel with goroutine ID, state, duration, stack trace
- [x] 4.7 Render GC events as semi-transparent red bands spanning all rows
- [x] 4.8 Render minimap: a thin canvas above the timeline showing the entire trace with a viewport rectangle, draggable to navigate

## 5. Frontend: Goroutine Analysis

- [x] 5.1 Create `TraceGoroutines.tsx` with a sortable table: ID, Name, Running time, Blocked time, Waiting time, Transitions
- [x] 5.2 Add a state breakdown stacked bar per goroutine row showing proportion of time in each state
- [x] 5.3 Click a goroutine to switch to Timeline tab and scroll to that goroutine

## 6. Frontend: GC Visualization

- [x] 6.1 Add GC summary stats bar to the TraceViewer header: count, total pause, avg pause, max pause
- [x] 6.2 Render a heap size area chart below the timeline, synced with timeline zoom/pan
- [x] 6.3 Add GC band tooltips on hover showing GC number, duration, and pause

## 7. Frontend: Blocking Analysis

- [x] 7.1 Create `TraceBlocking.tsx` with blocking categories (Channel, Mutex, Network, Syscall, Scheduler) sorted by total duration
- [x] 7.2 Expandable rows showing top blocking locations with stack traces and total/avg/count
- [x] 7.3 "Show on timeline" button that switches to Timeline tab, zooms to the blocking time range, and highlights the goroutine
