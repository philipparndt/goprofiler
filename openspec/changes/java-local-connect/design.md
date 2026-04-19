## Context

Java provides several mechanisms for discovering and attaching to local JVMs:

1. **`jps`** — JVM Process Status tool (included in JDK). Lists running JVMs with PID and main class. Fast, simple, reliable.
2. **`jcmd`** — JVM diagnostic command tool. Can list JVMs, trigger JFR recordings, enable JMX, and more. More capable than `jps`.
3. **Attach API** (`com.sun.tools.attach`) — programmatic JVM attach for loading agents and enabling JMX at runtime. Requires a Java subprocess.
4. **async-profiler** — can attach to a JVM by PID directly (`./asprof -d 30 <pid>`), no JVM configuration needed.

GoProfiler's Go backend can shell out to `jps`, `jcmd`, and async-profiler binaries. For dynamic JMX attach, it can use `jcmd` to enable the JMX agent on a running JVM.

## Goals / Non-Goals

**Goals:**
- Discover all local JVMs with one click
- Show useful metadata (main class, PID, JVM args, JMX status)
- Connect without requiring the target JVM to be pre-configured
- Support both JMX-based monitoring and async-profiler flame graphs

**Non-Goals:**
- Discovering remote JVMs (covered by JMX URL and K8s connection)
- Auto-installing JDK or async-profiler (show instructions if missing)
- Supporting non-HotSpot JVMs (GraalVM native images don't support jps/jcmd)

## Decisions

### 1. Use `jcmd` as primary discovery tool, `jps` as fallback

**Decision:** Run `jcmd -l` to list local JVMs (shows PID and main class). Fall back to `jps -lv` if `jcmd` is not found. `jcmd` is preferred because it can also be used for JFR control and JMX enablement.

**Why:** `jcmd` is the modern replacement for `jps`, available in JDK 8+, and provides a single tool for discovery + control. `jps` as fallback covers minimal JDK installations.

### 2. Dynamic JMX enablement via `jcmd`

**Decision:** When connecting to a local JVM that doesn't have JMX enabled, use `jcmd <pid> ManagementAgent.start jmxremote.port=<port> jmxremote.authenticate=false jmxremote.ssl=false` to enable JMX on a random available port.

**Why:** This avoids requiring developers to add JMX flags to their JVM startup. Works on JDK 8+ HotSpot. The port is random to avoid conflicts. Authentication is disabled since it's localhost-only.

### 3. async-profiler attach by PID

**Decision:** If async-profiler is available on the system, offer it as an alternative profiling method. Run `asprof start -o jfr <pid>` to start and `asprof stop -o jfr -f <output> <pid>` to stop and collect the JFR file.

**Why:** async-profiler produces high-quality flame graphs with very low overhead (~1%). No JVM pre-configuration needed — just the PID. Output as JFR format integrates with the existing JFR parser.

### 4. Refresh-on-demand process list

**Decision:** The process list is fetched on-demand when the user opens the "Local Java" tab, with a refresh button. Not auto-refreshing.

**Why:** Running `jcmd -l` is fast (<100ms) but auto-refreshing would be unnecessary since the user is actively choosing a process. A refresh button handles the case where a new JVM starts after opening the dialog.

### 5. Connection creates a managed target

**Decision:** When connecting to a local JVM, create a target with:
- `language: "java"`
- `connectionMethod: "jmx"` or `"async-profiler"`
- `localPid: <pid>` for reconnection and process monitoring
- JMX URL pointing to `localhost:<jmx-port>`

The PID is tracked so the connection can detect if the process dies.

**Why:** Integrates cleanly with the existing target model. The PID enables health checks and reconnection.

## Risks / Trade-offs

- **[jcmd permissions]** On some systems, `jcmd` can only see JVMs owned by the same user. → Mitigation: Document that the profiler must run as the same user as the target JVM. This is normal for development.
- **[JMX port conflicts]** Dynamically enabling JMX picks a random port. If the JVM already has JMX on a different port, we might miss it. → Mitigation: Check `jcmd <pid> ManagementAgent.status` first.
- **[async-profiler availability]** async-profiler is a separate install, not part of the JDK. → Mitigation: Show download instructions when not found. JMX is the primary path.
- **[macOS code signing]** async-profiler may require entitlements on macOS. → Mitigation: Document workarounds (`sudo` or SIP exceptions).
