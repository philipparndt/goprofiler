## ADDED Requirements

### Requirement: Discover local JVMs
The system SHALL discover all JVMs running on the local machine.

#### Scenario: List running JVMs
- **WHEN** the user opens the "Local Java" connection tab
- **THEN** the system runs `jcmd -l` (or `jps -lv` as fallback) and displays all running JVMs with PID and main class name

#### Scenario: Show process metadata
- **WHEN** a list of local JVMs is displayed
- **THEN** each entry shows: PID, main class (or JAR name), JVM arguments (truncated), and whether JMX is already enabled

#### Scenario: Refresh process list
- **WHEN** the user clicks the refresh button
- **THEN** the process list is re-fetched to show newly started or stopped JVMs

#### Scenario: Filter own process
- **WHEN** listing JVMs
- **THEN** the GoProfiler process itself and `jcmd`/`jps` tool processes are excluded from the list

### Requirement: JDK tools availability check
The system SHALL check if JDK tools (`jcmd`, `jps`) are available.

#### Scenario: jcmd not found
- **WHEN** `jcmd` is not in PATH and `JAVA_HOME/bin/jcmd` does not exist
- **THEN** the system falls back to `jps`; if neither is found, show an error with instructions to install a JDK

### Requirement: async-profiler availability check
The system SHALL detect if async-profiler is available on the system.

#### Scenario: async-profiler found
- **WHEN** `asprof` is in PATH or a configured path
- **THEN** async-profiler is offered as a profiling option when connecting

#### Scenario: async-profiler not found
- **WHEN** `asprof` is not available
- **THEN** JMX/JFR is used as the default connection method; a hint shows how to install async-profiler
