## ADDED Requirements

### Requirement: Connect via dynamic JMX attach
The system SHALL connect to a local JVM by dynamically enabling JMX via `jcmd`.

#### Scenario: JMX not enabled on target
- **WHEN** the user selects a JVM that does not have JMX enabled
- **THEN** the system runs `jcmd <pid> ManagementAgent.start jmxremote.port=<randomPort> jmxremote.authenticate=false jmxremote.ssl=false` to enable JMX, then connects

#### Scenario: JMX already enabled
- **WHEN** the user selects a JVM that already has JMX enabled on a known port
- **THEN** the system connects directly to the existing JMX port

#### Scenario: Connection creates target
- **WHEN** a local JVM connection is established
- **THEN** a target is created with language "java", the JMX URL, and the PID for lifecycle tracking

### Requirement: Connect via async-profiler PID attach
The system SHALL support connecting to a local JVM via async-profiler using the PID.

#### Scenario: Start async-profiler profiling
- **WHEN** the user chooses async-profiler for a local JVM
- **THEN** the system can start/stop profiling via `asprof` commands targeting the PID

#### Scenario: Collect profile from async-profiler
- **WHEN** profiling is stopped
- **THEN** the system collects the JFR output file and parses it into flame graphs

### Requirement: Process health monitoring
The system SHALL monitor whether the connected local JVM process is still running.

#### Scenario: Process exits
- **WHEN** the connected JVM process terminates
- **THEN** the target status changes to "unreachable" and the user is notified

#### Scenario: Reconnect after restart
- **WHEN** the user reconnects and a JVM with the same main class is running (possibly with a new PID)
- **THEN** the system offers to connect to the new instance
