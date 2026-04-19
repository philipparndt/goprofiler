## 1. Backend: Trace Prompt Templates

- [x] 1.1 Add trace data summarization helpers in `internal/ai/prompts.go`: `summarizeTrace(meta, goroutines, blocking, gc)` that builds a concise text summary of trace data (top goroutines by blocked time, blocking categories, GC stats)
- [x] 1.2 Add `BuildTraceOverviewPrompt(traceSummary, profileType)` — full trace analysis prompt
- [x] 1.3 Add `BuildTraceGoroutinePrompt(goroutineData, traceMeta)` — single goroutine analysis prompt with state transitions and stack traces
- [x] 1.4 Add `BuildTraceBlockingPrompt(blockingEntry, allBlocking, traceMeta)` — blocking entry analysis prompt with category context
- [x] 1.5 Add `BuildTraceSpanPrompt(span, goroutineName, adjacentSpans)` — single span analysis prompt
- [x] 1.6 Add `BuildTraceGCPrompt(gcEvents, traceMeta)` — GC analysis prompt
- [x] 1.7 Add `BuildTraceGoroutinesTabPrompt(goroutineStats, traceMeta)` — goroutines tab focused analysis
- [x] 1.8 Add `BuildTraceBlockingTabPrompt(allBlocking, traceMeta)` — blocking tab focused analysis

## 2. Backend: Wails Bindings

- [x] 2.1 Add `StartTraceAnalysis(req TraceAnalysisRequest)` Wails binding that accepts mode (trace-overview, trace-goroutine, trace-blocking, trace-span, trace-gc, trace-goroutines-tab, trace-blocking-tab), profile ID, target URL, and mode-specific data (goroutine ID, blocking entry index, span data)
- [x] 2.2 The binding loads the cached trace data, builds the appropriate prompt using the templates, and dispatches to the AI provider via the existing `RunWithProvider` infrastructure

## 3. Frontend: TraceViewer AI Integration

- [x] 3.1 Add `AiAnalysisPanel` import and state (`aiPanelVisible`, `aiError`, `permLevel`) to TraceViewer.tsx, with the panel rendered at the component level
- [x] 3.2 Add "Analyze Trace" gradient AI button in the TraceViewer header (next to tabs), wired to `StartTraceAnalysis` with mode `trace-overview`
- [x] 3.3 Pass AI trigger callbacks down to sub-components via props: `onAiAnalyze(mode, data)` callback

## 4. Frontend: Timeline AI

- [x] 4.1 Add "Explain Span" and "Explain Goroutine" buttons in the span detail panel (bottom of timeline) with adjacent span context
- [x] 4.2 Context menu deferred — span detail panel buttons serve the same purpose

## 5. Frontend: Goroutines Tab AI

- [x] 5.1 Add "Analyze Goroutines" AI button in the Goroutines tab toolbar
- [x] 5.2 Add per-row "Explain" button triggering `trace-goroutine` analysis for that goroutine

## 6. Frontend: Blocking Tab AI

- [x] 6.1 Add "Analyze Blocking" AI button in the Blocking tab toolbar
- [x] 6.2 Add per-entry "Explain" button triggering `trace-blocking` analysis for that entry

## 7. Frontend: GC Tab AI

- [x] 7.1 Add "Analyze GC" AI button in the GC tab
