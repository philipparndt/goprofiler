## Context

GoProfiler currently supports Go applications exclusively via `/debug/pprof/` endpoints. The architecture consists of:
- **Connection store**: Manages targets by URL, health checks via HTTP
- **Profiler/collector**: Fetches pprof profiles (CPU, heap, goroutine, etc.)
- **Monitor service**: Polls memstats and goroutine counts at 1s intervals
- **Flamegraph converter**: Parses pprof protobuf into flame graph trees
- **Trace parser**: Parses Go execution traces into structured data
- **Storage**: Stores profiles as binary blobs with metadata in SQLite

Java profiling uses fundamentally different mechanisms: JFR (Java Flight Recorder) for event recording and JMX (Java Management Extensions) for live monitoring. async-profiler provides an alternative for low-overhead sampling.

## Goals / Non-Goals

**Goals:**
- Full feature parity between Go and Java profiling experiences
- Reuse existing frontend components where possible (flame graphs, charts, AI panel)
- Support both JFR and async-profiler as Java profiling backends
- Java targets should feel native, not bolted-on

**Non-Goals:**
- Supporting other JVM languages (Kotlin, Scala) as separate language types — they use the same JVM profiling
- JMX MBean browsing (generic) — only profiling-related MBeans
- Remote JFR recording management (start/stop JFR from the profiler) — phase 2
- Modifying the Go profiling experience in any way

## Decisions

### 1. Language-aware target model

**Decision:** Add a `Language` field to `Target` (values: `"go"`, `"java"`). Connection validation, profiling, and monitoring dispatch based on language. The frontend conditionally renders language-appropriate labels and views.

**Why:** Clean separation. Each language has fundamentally different connection mechanisms, profile formats, and monitoring APIs. A discriminated union at the target level is the simplest abstraction.

**Alternatives considered:**
- Plugin architecture: Over-engineered for 2 languages
- Separate apps: Loses the unified experience

### 2. Java connection via JMX + HTTP agent

**Decision:** Java targets connect via two mechanisms:
1. **JMX**: Connect to `service:jmx:rmi:///jndi/rmi://{host}:{port}/jmxrmi` for live monitoring and JFR control. The Go backend uses a JMX client library or shells out to `jcmd`.
2. **async-profiler HTTP agent**: If the target runs the async-profiler HTTP endpoint (e.g., via `-agentpath`), connect similarly to Go's pprof endpoints.

**Why:** JMX is the standard Java management protocol. async-profiler's HTTP agent provides a lightweight alternative that mirrors pprof's HTTP interface.

### 3. JFR parsing in Go

**Decision:** Use `github.com/grafana/jfr-parser` (Grafana's Go-native JFR parser) to parse JFR recordings. Convert JFR stack traces into the existing `FlameNode` tree format.

**Why:** Grafana's parser is production-proven, written in Go, and handles the JFR binary format. No need for a Java subprocess to parse JFR files.

### 4. Profile format abstraction

**Decision:** Create a `profiler.Profile` interface that both pprof and JFR profiles implement. The flame graph converter accepts this interface. Storage stores the raw bytes regardless of format, with a `format` field ("pprof", "jfr", "async-profiler") in the metadata.

**Why:** The flame graph rendering, top functions table, and AI analysis all work on the same `FlameNode` tree. Only the parsing layer needs to know about the source format.

### 5. Java monitoring via JMX MBeans

**Decision:** Create a `JavaMonitorService` that polls JMX MBeans for:
- `java.lang:type=Memory` → heap/non-heap usage (like Go's memstats)
- `java.lang:type=OperatingSystem` → process CPU usage
- `java.lang:type=Threading` → thread count, peak threads
- `java.lang:type=GarbageCollector,name=*` → GC counts and times

Poll at 1s intervals, store in time-series buffers (same `MaxPoints` pattern as Go).

**Why:** JMX MBeans are the standard way to monitor JVM internals. Maps directly to the existing monitoring chart infrastructure.

### 6. Thread analysis replaces goroutine analysis

**Decision:** For Java targets, the "Goroutines" tab becomes "Threads". Thread states map to: `RUNNABLE`, `BLOCKED`, `WAITING`, `TIMED_WAITING`, `NEW`, `TERMINATED`. Use JFR `jdk.ThreadDump` events or JMX `ThreadMXBean` for thread dumps with stack traces.

**Why:** Java threads are the direct equivalent of Go goroutines. Same visualization (state timeline, state distribution chart), different state names and data source.

### 7. Phased implementation

**Decision:** Implement in this order:
1. Language-aware target model + Java connection (JMX)
2. JFR parsing + flame graph conversion
3. Java monitoring (heap, CPU, threads, GC charts)
4. Thread analysis view
5. JFR event browser
6. async-profiler integration
7. AI integration for Java profiles

**Why:** Each phase is independently useful. JFR + flame graphs gives immediate value. Monitoring and thread analysis follow the same patterns as Go.

## Risks / Trade-offs

- **[JMX complexity]** JMX/RMI from Go is non-trivial — there's no mature Go JMX client. → Mitigation: Use `jcmd` or a small Java helper process for JMX operations. Alternatively, require the Java target to expose metrics via HTTP (e.g., Jolokia or Prometheus JMX exporter).
- **[JFR parser maturity]** Grafana's JFR parser handles the most common events but may not cover all JFR event types. → Mitigation: Start with core events (CPU, allocation, GC, thread). Add event types incrementally.
- **[Scope]** Full parity is a large effort. → Mitigation: Phased delivery. Each phase ships independently.
- **[Testing]** Need Java applications to test against. → Mitigation: Include a sample Java app in the repo for development and CI.
