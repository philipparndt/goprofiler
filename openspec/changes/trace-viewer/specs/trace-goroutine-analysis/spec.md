## ADDED Requirements

### Requirement: Goroutine state summary table
The system SHALL provide a summary table showing all goroutines with columns: ID, Name, Total Running time, Total Blocked time, Total Waiting time, State transitions count. The table SHALL be sortable by any column.

#### Scenario: Sort by blocked time
- **WHEN** user clicks the "Blocked" column header
- **THEN** goroutines are sorted by total blocked time descending, showing the most contended goroutines first

#### Scenario: Click goroutine in table
- **WHEN** user clicks a goroutine row in the summary table
- **THEN** the timeline scrolls to and highlights that goroutine's row

### Requirement: Goroutine state breakdown
The system SHALL display a per-goroutine state breakdown as a horizontal stacked bar showing the proportion of time spent in each state (Running/Runnable/Blocked/Syscall/Waiting).

#### Scenario: View state breakdown
- **WHEN** user selects a goroutine
- **THEN** system shows a stacked bar with percentage labels for each state, plus the raw durations

### Requirement: State transition log
The system SHALL display a chronological log of state transitions for a selected goroutine, showing: timestamp, from-state, to-state, reason, and stack trace.

#### Scenario: View transitions
- **WHEN** user selects a goroutine and opens its transitions
- **THEN** system shows a scrollable list of state changes with timestamps and expandable stack traces
