## Why

Before connecting to Java applications in Kubernetes or remote servers, developers need to profile locally running JVMs during development. This is the most common profiling scenario — you're developing a Java service, running it locally (via IDE, Maven, Gradle, or `java -jar`), and you want to quickly profile it without configuring JMX manually or figuring out which process to attach to.

GoProfiler should discover locally running JVMs automatically and let users connect with one click, just like connecting to a local Go application is as simple as entering `localhost:6060`.

## What Changes

- **Local JVM discovery**: Automatically discover all JVMs running on the local machine using `jps` (JVM Process Status) or the Attach API
- **Process list with metadata**: Show running JVMs with PID, main class name, JVM arguments, and whether JMX/JFR is already enabled
- **One-click connect**: Select a local JVM and connect — GoProfiler handles JMX attachment or async-profiler agent loading automatically
- **JMX auto-enable**: If the target JVM doesn't have JMX enabled, offer to attach via the Attach API and enable JMX dynamically
- **async-profiler attach**: Attach async-profiler to a local JVM by PID for low-overhead flame graph profiling without any JVM configuration

## Capabilities

### New Capabilities
- `java-local-discovery`: Discover locally running JVMs with process metadata
- `java-local-attach`: Attach to local JVMs for profiling via JMX dynamic attach or async-profiler PID attach

### Modified Capabilities

## Impact

- **Backend**: New `internal/java/discovery.go` for JVM process discovery, `internal/java/attach.go` for dynamic JMX attach and async-profiler PID attach
- **Frontend**: New "Local Java" tab in the connect dialog with process list and one-click connect
- **Dependencies**: Requires `jps` (comes with JDK) for process discovery. async-profiler binary for PID-based profiling (optional).
- **Desktop-only**: Local process discovery requires local system access — Wails desktop feature
