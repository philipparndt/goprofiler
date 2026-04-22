## ADDED Requirements

### Requirement: Java CPU profiling via JFR
The system SHALL support CPU profiling of Java applications using JFR CPU sample events.

#### Scenario: Capture CPU profile
- **WHEN** the user starts a CPU profile on a Java target
- **THEN** the system triggers a JFR recording with CPU sampling, downloads the .jfr file, parses it, and displays a flame graph

#### Scenario: CPU flame graph from JFR
- **WHEN** a JFR recording with CPU samples is loaded
- **THEN** the flame graph shows Java method call stacks with cumulative CPU time

### Requirement: Java heap profiling via JFR
The system SHALL support heap/allocation profiling using JFR allocation events.

#### Scenario: Capture allocation profile
- **WHEN** the user starts a heap profile on a Java target
- **THEN** the system triggers a JFR recording with allocation sampling and displays allocation flame graphs

### Requirement: Java lock contention profiling
The system SHALL support lock contention profiling using JFR or async-profiler.

#### Scenario: Lock contention flame graph
- **WHEN** the user starts a lock profile on a Java target
- **THEN** the system captures lock contention data and displays it as a flame graph with wait times

### Requirement: async-profiler flame graphs
The system SHALL support generating flame graphs from async-profiler output.

#### Scenario: CPU flame graph from async-profiler
- **WHEN** the user starts a CPU profile on a Java target configured with async-profiler
- **THEN** async-profiler captures CPU samples and the system displays a flame graph

#### Scenario: Allocation flame graph from async-profiler
- **WHEN** the user starts an allocation profile via async-profiler
- **THEN** the system displays allocation flame graphs from async-profiler output

### Requirement: JFR recording storage
The system SHALL store JFR recordings alongside pprof profiles.

#### Scenario: JFR recording persisted
- **WHEN** a JFR recording is captured
- **THEN** it is stored with metadata (target, timestamp, duration, type) and can be reloaded later
