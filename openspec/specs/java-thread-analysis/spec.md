# java-thread-analysis Specification

## Purpose
TBD - created by archiving change java-profiling-support. Update Purpose after archive.
## Requirements
### Requirement: Thread state timeline
The system SHALL display a thread state timeline for Java targets, equivalent to Go's goroutine timeline in the trace viewer.

#### Scenario: Thread timeline from JFR
- **WHEN** a JFR recording is loaded that contains thread state events
- **THEN** a timeline shows each thread as a row with color-coded state spans (RUNNABLE, BLOCKED, WAITING, TIMED_WAITING)

### Requirement: Thread statistics table
The system SHALL display a sortable thread statistics table, equivalent to the goroutine statistics table.

#### Scenario: Thread stats from JFR
- **WHEN** viewing a JFR recording's thread data
- **THEN** a table shows each thread with time spent in each state, sorted by most blocked

### Requirement: Thread dump viewer
The system SHALL allow viewing thread dumps from Java targets.

#### Scenario: Thread dump capture
- **WHEN** the user requests a thread dump from a connected Java target
- **THEN** the system captures a thread dump via JMX and displays it with stack traces, thread states, and lock information

