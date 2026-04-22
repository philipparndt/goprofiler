## 1. JMX Bridge Java Tool

- [x] 1.1 Create `tools/jmx-bridge/JmxBridge.java` — single-file Java tool that connects to a JVM via JMX URL, reads all platform MBeans, and outputs JSON to stdout
- [x] 1.2 Implement `monitor` command — continuous JSON streaming (1 line/second) with: heap, nonHeap, memory pools, GC per collector, threads, CPU, classes, JIT, runtime info
- [x] 1.3 Implement `threads` command — full thread dump via `ThreadMXBean.dumpAllThreads()` with stack traces, lock info, monitors, and deadlock detection
- [x] 1.4 Implement `jfr start/stop/dump` commands — manage JFR recordings via `FlightRecorderMXBean`
- [x] 1.5 Handle JMX URL parsing — support both `host:port` shorthand and full `service:jmx:rmi:///...` URLs
- [x] 1.6 Add `Makefile` target to compile `JmxBridge.java` to `jmx-bridge.jar`
- [x] 1.7 Embed or bundle `jmx-bridge.jar` with the GoProfiler binary

## 2. Go Backend: Bridge Process Management

- [x] 2.1 Create `internal/java/bridge.go` — `BridgeProcess` struct that spawns `java -jar jmx-bridge.jar <url> <cmd>`, reads stdout line by line, parses JSON into Go structs
- [x] 2.2 Define `JmxSnapshot` Go struct matching the bridge's JSON output (heap, pools, gc, threads, cpu, classes, jit, runtime)
- [x] 2.3 Update `JavaMonitorService` to use bridge process instead of `jcmd` — spawn `monitor` command, parse streaming JSON into `JavaDataPoint` with rich fields
- [x] 2.4 Add auto-restart logic — if bridge process dies, restart after 2s delay
- [x] 2.5 Add bridge-based thread dump: `CaptureThreadDumpViaBridge(jmxUrl)` replacing the `jcmd Thread.print` approach

## 3. Go Backend: Remote JFR via Bridge

- [x] 3.1 Update `startJavaProfile` to use bridge JFR commands for remote targets (no `jcmd` needed)
- [x] 3.2 For local targets with PID: keep `jcmd JFR.start` as primary, bridge as fallback
- [x] 3.3 For K8s targets: always use bridge JFR via port-forwarded JMX

## 4. Enhanced Monitor Data Model

- [x] 4.1 Extend `JavaDataPoint` with: memory pools array, per-collector GC array, daemon thread count, process/system CPU, loaded classes, JIT time, VM info
- [x] 4.2 Update `JavaHistoryResponse` and frontend `JavaMonitorDataPoint` type to include the new fields
- [x] 4.3 Add `GetJavaVMInfo(targetId)` Wails binding that returns runtime info (VM name, version, uptime, args)

## 5. Frontend: Rich Monitoring Charts

- [x] 5.1 Update `JavaMonitorCharts.tsx` — add per-pool memory breakdown chart (stacked area: Eden + Survivor + Old Gen, separate line for Metaspace)
- [x] 5.2 Add per-collector GC chart — young GC rate vs old GC rate over time
- [x] 5.3 Add CPU chart — process CPU % and system CPU % lines
- [x] 5.4 Update thread chart — show daemon count alongside total, add peak line
- [x] 5.5 Add JVM info card to the Info tab — VM name, version, uptime, arguments, classpath, loaded classes, JIT compilation time

## 6. Frontend: Thread Dump Viewer

- [x] 6.1 Add "Thread Dump" button to the Monitor tab for Java targets
- [x] 6.2 Create `JavaThreadDump.tsx` — thread dump viewer showing: thread name, state, stack trace, held locks, waiting-on lock, deadlock warnings
- [x] 6.3 Wire thread dump to use bridge `threads` command via Wails binding
