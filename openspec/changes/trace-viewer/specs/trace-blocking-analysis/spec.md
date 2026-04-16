## ADDED Requirements

### Requirement: Blocking summary by category
The system SHALL provide a blocking analysis view grouping all blocking events by category: Channel operations, Mutex/Lock, Network I/O, Syscalls, Scheduler latency. Each category shows total duration, event count, and top locations.

#### Scenario: View blocking summary
- **WHEN** user switches to the Blocking Analysis tab within the trace viewer
- **THEN** system shows categories sorted by total blocking duration, with expandable location details

#### Scenario: Expand category
- **WHEN** user expands a blocking category
- **THEN** system shows the top blocking locations (function + file:line) sorted by total wait time, with stack traces

### Requirement: Jump to timeline
The system SHALL allow jumping from a blocking event to its location on the goroutine timeline.

#### Scenario: Click blocking event
- **WHEN** user clicks "Show on timeline" for a blocking location
- **THEN** the timeline view activates, zooms to the time range of that blocking event, and highlights the affected goroutine

### Requirement: Blocking flame graph
The system SHALL provide a flame graph of blocking wait time, showing which call paths contribute the most blocking.

#### Scenario: View blocking flame graph
- **WHEN** user selects "Blocking Flame Graph" sub-tab
- **THEN** system renders a flame graph where frame width represents total blocking duration (not CPU time)
