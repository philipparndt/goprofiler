## Why

Our Java profiling is severely limited compared to professional tools like JMC, VisualVM, or YourKit because:

1. **No real JMX access**: We use `jcmd` which only works for local JVMs and provides limited data. Professional tools connect via JMX and read the full set of MBeans — detailed per-pool memory (Eden, Survivor, Old Gen, Metaspace), per-thread CPU time, per-collector GC stats, class loading, JIT compilation, and more.

2. **No remote JVM support**: For K8s pods, `jcmd` doesn't work at all (it uses the local Attach API). We can port-forward the JMX port, but our Go backend can't speak the JMX/RMI protocol.

3. **No JFR management**: JMC can start/stop/stream Flight Recorder recordings via the `FlightRecorderMXBean`. We currently shell out to `jcmd JFR.start` which only works locally.

**How do professional tools do it?** They're written in Java, so they use `javax.management.remote.JMXConnectorFactory` to connect to any JVM via JMX remoting. This gives them access to all MBeans and the Flight Recorder API.

**Our solution**: Bundle a small Java CLI tool (`jmx-bridge.jar`) that GoProfiler launches as a subprocess. It connects to the target JVM via JMX, reads all MBeans, and streams JSON to stdout. This gives us the same data as JMC while keeping our Go backend.

## What Changes

- **Java JMX Bridge tool**: A small Java CLI (`jmx-bridge.jar`, ~20KB) bundled with GoProfiler that:
  - Connects to any JVM via JMX URL (`service:jmx:rmi://...` or `host:port`)
  - Reads all platform MBeans and returns structured JSON
  - Supports commands: `monitor` (continuous streaming), `snapshot` (one-shot), `threads` (thread dump with locks), `jfr-start`, `jfr-stop`, `jfr-dump`
  - Works both locally and remotely (via port-forward)

- **Rich monitoring data**: Replace `jcmd GC.heap_info` with real MBean data:
  - Per memory pool: Eden, Survivor, Old Gen, Metaspace (used/committed/max)
  - Per GC collector: young GC count/time, old GC count/time
  - Thread details: count, daemon count, peak, per-thread CPU time
  - Process CPU load, system CPU load
  - Class loading: loaded, unloaded, total
  - JIT compilation time
  - Runtime: uptime, VM name, VM version, arguments

- **Thread dump with locks**: Full thread dump showing thread state, stack trace, lock owner, deadlock detection — via `ThreadMXBean`

- **Remote JFR control**: Start/stop/dump JFR recordings via `FlightRecorderMXBean` instead of `jcmd`, enabling JFR on remote JVMs (K8s)

- **Works everywhere**: Local JVMs, remote JVMs, K8s pods (via port-forwarded JMX)

## Capabilities

### New Capabilities
- `jmx-bridge`: Java subprocess that reads JMX MBeans and streams JSON to the Go backend
- `rich-java-monitoring`: Detailed per-pool memory, per-collector GC, per-thread CPU, class loading, JIT stats
- `remote-jfr`: Start/stop/dump JFR recordings on remote JVMs via JMX

### Modified Capabilities

## Impact

- **New**: `tools/jmx-bridge/` — small Java project (single .java file, compiled to JAR)
- **Backend**: Replace `jcmd`-based monitoring with JMX bridge subprocess; update `JavaMonitorService` with rich data
- **Frontend**: Update `JavaMonitorCharts` with per-pool memory chart, per-collector GC chart, enhanced thread view
- **Build**: `make build` compiles the JAR; requires JDK to build (not to run — JAR is prebuilt)
- **Dependencies**: JDK 11+ on the build machine; JRE 11+ on the user's machine (same requirement as profiling Java apps)
