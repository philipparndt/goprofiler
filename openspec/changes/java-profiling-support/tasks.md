## Phase 1: Language Abstraction

- [ ] 1.1 Add `Language` field ("go", "java") to `Target` and `savedTarget` structs in `internal/connection/store.go`; persist in connections.json
- [ ] 1.2 Add `ConnectionMethod` field ("pprof", "jmx", "async-profiler") to Target for Java connection variants
- [ ] 1.3 Update frontend `Target` type in `api.ts` with `language` and `connectionMethod` fields
- [ ] 1.4 Add language badge component showing "Go" or "Java" next to target names in sidebar and connection list
- [ ] 1.5 Update connect dialog to allow choosing language/connection type (Go pprof, Java JMX, Java async-profiler)

## Phase 2: JMX Connection

- [ ] 2.1 Create `internal/java/jmx.go` — JMX client that uses `jcmd` or a helper to connect to JVM targets and read MBean attributes
- [ ] 2.2 Create `internal/java/connection.go` — Java target validator that checks JMX connectivity (equivalent to `validatePprof`)
- [ ] 2.3 Update connection store's `Connect()` to dispatch to Go or Java validation based on language selection
- [ ] 2.4 Add JMX health check loop for Java targets (equivalent to pprof health check)

## Phase 3: JFR Profiling

- [ ] 3.1 Add `github.com/grafana/jfr-parser` dependency
- [ ] 3.2 Create `internal/java/jfr_parser.go` — parse JFR recordings into `FlameNode` trees, extracting CPU sample stacks, allocation stacks, and lock contention stacks
- [ ] 3.3 Create `internal/java/profiler.go` — trigger JFR recordings via `jcmd` (start/stop recording, download .jfr file) for CPU, heap, and lock profiling
- [ ] 3.4 Update `internal/flamegraph/convert.go` — extract a `ConvertFromStacks(stacks [][]string, values []int64)` function that both pprof and JFR parsers can use to build `FlameNode` trees
- [ ] 3.5 Update storage to handle JFR recordings (store with `format: "jfr"` metadata alongside pprof profiles)
- [ ] 3.6 Update profile viewer frontend to handle JFR profiles — same flame graph display, but with Java-appropriate labels
- [ ] 3.7 Add Wails bindings for Java profiling (start JFR recording, stop, list Java profile types)

## Phase 4: Java Monitoring

- [ ] 4.1 Create `internal/java/monitor.go` — `JavaMonitorService` that polls JMX MBeans every 1s for: heap used/committed/max, CPU usage, thread count/peak, GC counts/times
- [ ] 4.2 Define `JavaDataPoint` struct with JVM metrics and `JavaHistoryResponse` for the API
- [ ] 4.3 Add API endpoint / Wails binding for Java monitoring history with incremental `since` polling
- [ ] 4.4 Create `JavaHeapChart.tsx` — real-time chart showing used heap, committed heap, max heap (equivalent to `MemoryChart.tsx`)
- [ ] 4.5 Create `JavaCpuChart.tsx` — real-time JVM CPU usage chart
- [ ] 4.6 Create `JavaThreadChart.tsx` — real-time thread count chart (equivalent to `GoroutineChart.tsx`)
- [ ] 4.7 Update `ConnectionDetail.tsx` Monitor tab to render Java charts when target language is "java"

## Phase 5: Thread Analysis

- [ ] 5.1 Create `internal/java/threads.go` — parse JFR thread state events into a data structure equivalent to `TraceData` with thread spans (RUNNABLE, BLOCKED, WAITING, TIMED_WAITING)
- [ ] 5.2 Create `internal/java/thread_dump.go` — capture thread dump via JMX `ThreadMXBean`, parse into structured format with stack traces, lock info, and deadlock detection
- [ ] 5.3 Create `JavaThreadTimeline.tsx` — thread state timeline component reusing the canvas rendering pattern from `TraceTimeline.tsx` with Java thread states and colors
- [ ] 5.4 Create `JavaThreadTable.tsx` — sortable thread statistics table (equivalent to `TraceGoroutines.tsx`)
- [ ] 5.5 Create `JavaThreadDump.tsx` — thread dump viewer with stack traces, lock info, and deadlock highlighting
- [ ] 5.6 Wire Java thread views into profile viewer for JFR recordings containing thread events

## Phase 6: Java GC Analysis

- [ ] 6.1 Create `internal/java/gc.go` — parse JFR GC events (jdk.GCPhasePause, jdk.GarbageCollection, jdk.G1GarbageCollection, etc.) into structured data with collector type, pause times, heap before/after
- [ ] 6.2 Create `JavaGCAnalysis.tsx` — GC analysis view showing pause distribution, heap utilization, collector info (equivalent to `TraceGC.tsx` but with Java-specific metrics like promotion rate, old/young gen)
- [ ] 6.3 Add Java GC data to AI prompt templates for Java-specific GC explanations

## Phase 7: JFR Event Browser

- [ ] 7.1 Create `internal/java/events.go` — parse all JFR event types into a browsable structure grouped by category (CPU, Memory, GC, I/O, Exceptions, Class Loading, Compilation, etc.)
- [ ] 7.2 Create `JfrEventBrowser.tsx` — event browser component with category tree, event list with filtering, and detail view for individual events
- [ ] 7.3 Add "Events" tab to profile viewer for JFR recordings

## Phase 8: async-profiler Integration

- [ ] 8.1 Create `internal/java/asyncprofiler.go` — client for async-profiler's HTTP API (start/stop profiling, download profile, check status)
- [ ] 8.2 Support async-profiler output formats (collapsed stacks → `FlameNode` tree, JFR output)
- [ ] 8.3 Update connect dialog to support async-profiler HTTP endpoint as a Java connection method
- [ ] 8.4 Add async-profiler-specific profile types (cpu, alloc, lock, wall, itimer)

## Phase 9: AI Integration for Java

- [ ] 9.1 Add Java-specific prompt templates in `internal/ai/java_prompts.go` — CPU explain/optimize, heap analysis, thread analysis, GC analysis, lock contention, all with Java terminology
- [ ] 9.2 Update `StartAnalysis` and `StartTraceAnalysis` Wails bindings to detect Java profiles and use Java-specific prompts
- [ ] 9.3 Ensure all AI buttons (explain, optimize, context menu) work correctly for Java profiles with Java-appropriate context

## Phase 10: Sample App & Testing

- [ ] 10.1 Create `examples/java-sample/` — a simple Java application with known performance issues (allocation-heavy, lock contention, GC pressure) for testing
- [ ] 10.2 Add instructions for running the sample app with JFR and async-profiler enabled
