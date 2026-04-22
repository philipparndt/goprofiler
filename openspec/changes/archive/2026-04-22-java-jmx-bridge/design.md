## Context

Java profilers access JVM internals via JMX (Java Management Extensions), a standard API for monitoring and managing Java applications. JMX provides "MBeans" — managed beans that expose metrics:

| MBean | Data | Equivalent in Go |
|-------|------|------------------|
| `MemoryMXBean` | Heap/non-heap usage | `/debug/pprof/heap` memstats |
| `MemoryPoolMXBean` (per pool) | Eden, Survivor, Old Gen, Metaspace | No equivalent |
| `GarbageCollectorMXBean` (per collector) | Young GC count/time, Old GC count/time | GC stats from memstats |
| `ThreadMXBean` | Thread count, CPU time per thread, deadlock detection | Goroutine count |
| `OperatingSystemMXBean` | Process CPU %, system CPU % | CPU profiling |
| `RuntimeMXBean` | Uptime, VM args, classpath | `/debug/pprof/cmdline` |
| `ClassLoadingMXBean` | Loaded/unloaded classes | No equivalent |
| `CompilationMXBean` | JIT compilation time | No equivalent |
| `FlightRecorderMXBean` | Start/stop/dump JFR recordings | No equivalent |

JMX uses the RMI protocol which is Java-specific. There is no Go implementation. Professional tools (JMC, VisualVM) are written in Java and use `javax.management.remote.JMXConnectorFactory`.

## Goals / Non-Goals

**Goals:**
- Full MBean access matching JMC/VisualVM capabilities
- Work for both local and remote JVMs (including K8s via port-forward)
- Continuous monitoring with 1-second polling
- Thread dumps with lock information and deadlock detection
- Remote JFR recording management

**Non-Goals:**
- Implementing JMX/RMI in Go (too complex, not maintainable)
- Requiring a Java agent to be injected into the target JVM (we connect externally)
- Supporting JMX authentication (can be added later)

## Decisions

### 1. Java subprocess bridge

**Decision:** Create a single-file Java tool (`JmxBridge.java`) compiled to `jmx-bridge.jar`. GoProfiler spawns it as a subprocess with the JMX URL as argument. It connects, reads MBeans, and outputs JSON lines to stdout.

**Why:** Minimal footprint (~20KB JAR), no external dependencies (uses only `java.management` module in JDK), runs on any JRE 11+. Same approach used by Jolokia and Hawtio.

**Alternatives considered:**
- Jolokia agent: Requires injection into target JVM
- Go JMX client: RMI protocol is undocumented and complex
- REST/gRPC sidecar: Heavier than needed

### 2. Command-based protocol

**Decision:** The bridge supports commands:
- `monitor` — stream MBean snapshots as JSON every second
- `threads` — one-shot thread dump with full detail
- `jfr start <name> [settings]` — start a JFR recording
- `jfr stop <name> <file>` — stop recording and save to file
- `jfr dump <name> <file>` — dump current recording to file

Commands are passed as CLI arguments: `java -jar jmx-bridge.jar <jmxUrl> <command>`

**Why:** Simple, stateless, one process per operation. For monitoring, a long-running `monitor` process streams data continuously.

### 3. Rich monitoring JSON schema

**Decision:** The `monitor` command outputs one JSON object per second containing:
```json
{
  "heap": {"used": N, "committed": N, "max": N},
  "nonHeap": {"used": N, "committed": N},
  "pools": [{"name": "G1 Eden Space", "used": N, "committed": N, "max": N, "type": "HEAP"}, ...],
  "gc": [{"name": "G1 Young Generation", "count": N, "timeMs": N}, {"name": "G1 Old Generation", ...}],
  "threads": {"count": N, "daemon": N, "peak": N},
  "cpu": {"process": 0.15, "system": 0.45},
  "classes": {"loaded": N, "unloaded": N},
  "jit": {"totalTimeMs": N},
  "runtime": {"uptimeMs": N, "vmName": "...", "vmVersion": "..."}
}
```

**Why:** Flat JSON is easy to parse in Go. One object per line enables streaming.

### 4. Bridge lifecycle managed by Go

**Decision:** `JavaMonitorService` spawns the bridge process and reads its stdout line by line. If the process dies, it's restarted. On target disconnect, the process is killed.

**Why:** Matches our existing pattern for `kubectl port-forward` process management.

### 5. Bundle prebuilt JAR

**Decision:** The JAR is compiled during `make build` and embedded in the Go binary via `go:embed`, or placed in a known location alongside the binary.

**Why:** Users don't need a JDK to run GoProfiler — only a JRE (which they already have if they're profiling Java apps). The JAR is tiny (~20KB).

## Risks / Trade-offs

- **[JRE requirement]** Users need a JRE on the machine running GoProfiler (not the target). → Mitigation: Error message with install instructions. Most Java developers already have a JDK.
- **[Process overhead]** One bridge process per monitored Java target. → Mitigation: Each process is lightweight (~10MB RSS). Clean up on disconnect.
- **[JMX authentication]** We don't support JMX auth initially. → Mitigation: Most dev/staging JVMs don't use JMX auth. Can add username/password support later.
- **[RMI port issues]** JMX over RMI uses a random secondary port. → Mitigation: Document `-Dcom.sun.management.jmxremote.rmi.port=<same as jmx port>` flag.
