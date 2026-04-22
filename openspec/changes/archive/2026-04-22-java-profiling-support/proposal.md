## Why

GoProfiler has reached a mature state for Go application profiling with flame graphs, memory monitoring, CPU monitoring, goroutine analysis, trace viewing, blocking analysis, and AI-powered explanations. Java developers face the same profiling challenges but lack a modern, unified tool — JMC (Java Mission Control) is powerful but heavyweight, and most alternatives focus on only one aspect of profiling. Bringing GoProfiler's UX to Java would serve a much larger developer community while reusing most of the existing frontend infrastructure.

## What Changes

### Architecture: Multi-language profiling backend

- **Language-aware target model**: Targets gain a `language` field ("go" or "java"). The UI adapts views and capabilities based on the target's language.
- **Java connection methods**: Support two connection mechanisms:
  - **JFR (Java Flight Recorder)** via JMX: Built into JDK 11+, provides CPU, memory, GC, thread, and I/O events. The primary method for comprehensive profiling.
  - **async-profiler**: Attaches to a running JVM via agent or pid. Produces CPU flame graphs, allocation profiling, and lock contention with very low overhead. Used for targeted flame graph analysis.
- **Profile format abstraction**: The existing pprof-based profile storage and flame graph conversion are abstracted to also handle JFR recordings (.jfr files) and async-profiler output.

### Java profiling features (full parity with Go)

- **CPU flame graphs**: From JFR CPU samples or async-profiler CPU mode
- **Heap/allocation analysis**: From JFR allocation events or async-profiler alloc mode
- **Thread monitoring**: Real-time thread state chart (equivalent to goroutine chart), showing running/blocked/waiting/timed_waiting states
- **GC analysis**: From JFR GC events — pause times, frequency, collector type, heap utilization
- **Lock/contention analysis**: From JFR or async-profiler lock mode — equivalent to Go's blocking analysis
- **Memory monitoring**: Real-time heap usage chart from JMX MBeans (equivalent to Go's memstats chart)
- **CPU monitoring**: Real-time CPU usage from JMX (equivalent to Go's CPU chart)
- **AI analysis**: All AI features (explain, optimize, context menu) work with Java profiles and traces
- **JFR event viewer**: Browse all JFR events (I/O, exceptions, class loading, etc.) — unique to Java, no Go equivalent

### Frontend adaptations

- **Language badge**: Targets show "Go" or "Java" badge in sidebar and connection list
- **Adaptive views**: Profile viewer and monitoring tabs show language-appropriate labels (threads vs goroutines, JVM heap vs Go heap, etc.)
- **Java-specific views**: JFR event browser, thread dump viewer

## Capabilities

### New Capabilities
- `java-connection`: Connect to Java applications via JMX (JFR) or async-profiler agent
- `java-profiling`: CPU/heap/lock flame graphs from JFR recordings and async-profiler
- `java-monitoring`: Real-time JMX-based monitoring (heap, CPU, threads, GC)
- `java-thread-analysis`: Thread state visualization and analysis (equivalent to goroutine analysis)
- `java-gc-analysis`: GC event analysis from JFR recordings
- `java-jfr-events`: Browse and inspect all JFR event types
- `language-abstraction`: Abstract connection, profiling, and monitoring to support multiple languages

### Modified Capabilities

## Impact

- **Backend**: Major — new packages for JFR parsing, JMX connection, async-profiler integration, thread monitoring. Refactor connection store and profiler to be language-aware.
- **Frontend**: Moderate — new Java-specific components, language-conditional rendering in existing components, thread chart (similar to goroutine chart)
- **Dependencies**: `github.com/grafana/jfr-parser` (Go JFR parser), JMX client library
- **Storage**: JFR recordings stored alongside pprof profiles
- **Build**: No new build dependencies (Go backend handles JFR parsing natively)
- **Branding**: Name stays "GoProfiler" — Java is an addition to the core Go focus
