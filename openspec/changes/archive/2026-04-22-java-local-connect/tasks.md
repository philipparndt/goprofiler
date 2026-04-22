## 1. JVM Discovery Backend

- [x] 1.1 Create `internal/java/discovery.go` — `DiscoverLocalJVMs()` function that runs `jcmd -l` (fallback `jps -lv`), parses output into `[]LocalJVM` structs with PID, main class, args
- [x] 1.2 Add JMX status detection — for each discovered JVM, run `jcmd <pid> ManagementAgent.status` to check if JMX is already enabled and on which port
- [x] 1.3 Add tool availability checks — `CheckJcmdAvailable()`, `CheckAsprofAvailable()` returning bool + path
- [x] 1.4 Filter out GoProfiler's own process and JDK tool processes (jcmd, jps) from the discovery results

## 2. JMX Dynamic Attach Backend

- [x] 2.1 Create `internal/java/attach.go` — `EnableJMX(pid int) (port int, error)` that runs `jcmd <pid> ManagementAgent.start jmxremote.port=<port> jmxremote.authenticate=false jmxremote.ssl=false` with a random available port
- [x] 2.2 Add `ConnectLocalJVM(pid int, method string) (*Target, error)` that discovers the JVM, enables JMX if needed, creates a target with language "java" and the JMX URL
- [x] 2.3 Add PID-based health check — periodically check if the process with the stored PID is still running; mark target as unreachable if not

## 3. async-profiler Attach Backend

- [x] 3.1 Create `internal/java/asyncprofiler.go` — `StartProfile(pid int, mode string) error` and `StopProfile(pid int, outputPath string) error` using `asprof` commands
- [x] 3.2 Support profiling modes: cpu, alloc, lock, wall — mapping to async-profiler event types
- [x] 3.3 Output as JFR format (`-o jfr`) for integration with existing JFR parser

## 4. Wails Bindings

- [x] 4.1 Add `DiscoverLocalJVMs()` binding — returns list of local JVMs with PID, main class, args, JMX status, async-profiler availability
- [x] 4.2 Add `ConnectLocalJVM(pid, method)` binding — enables JMX if needed, creates target, returns target info
- [x] 4.3 Add `StartJavaProfile(targetId, mode)` and `StopJavaProfile(targetId)` bindings for async-profiler profiling
- [x] 4.4 Add Target fields: `LocalPid int`, `JavaMainClass string` for local JVM tracking and reconnection

## 5. Frontend: Local Java Connection UI

- [x] 5.1 Create `LocalJavaConnect.tsx` — process list component showing discovered JVMs with PID, main class (truncated), JVM args preview, JMX status badge, and connect button
- [x] 5.2 Add refresh button to re-run discovery
- [x] 5.3 Add connection method selector per JVM: "JMX (monitoring + profiling)" or "async-profiler (flame graphs only)" — default to JMX, show async-profiler only if available
- [x] 5.4 Integrate into connect dialog as a "Local Java" tab (alongside "Direct URL" and "Kubernetes")
- [x] 5.5 Show tool status bar: "jcmd: found" / "asprof: not found (install)" with links to install instructions

## 6. Frontend: Local Java Target Display

- [x] 6.1 Show local JVM info in connection detail: PID, main class, connection method, JMX port
- [x] 6.2 Add "Local" badge for targets connected via local PID discovery
- [x] 6.3 Handle process-died state — show "Process exited" message with option to scan for a restarted instance

## 7. Settings

- [x] 7.1 Add `asyncProfilerPath` setting — optional custom path to `asprof` binary (auto-detected from PATH by default)
