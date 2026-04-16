## ADDED Requirements

### Requirement: Capture threadcreate profile
The system SHALL support capturing a `threadcreate` snapshot profile by fetching `/debug/pprof/threadcreate` from the target pprof endpoint. It SHALL be treated as a snapshot type (no duration parameter).

#### Scenario: Capture threadcreate snapshot
- **WHEN** the user selects "Thread Create" and initiates a snapshot
- **THEN** the backend fetches `/debug/pprof/threadcreate` from the target
- **AND** stores the result as a profile associated with the current connection

#### Scenario: Empty profile (no threads created)
- **WHEN** the captured `threadcreate` profile contains no samples
- **THEN** the system stores and displays it without error, showing an empty flame graph

### Requirement: Display threadcreate profile in the UI
The system SHALL list `threadcreate` as a selectable option in the snapshot group of the profile type selector. It SHALL be labeled "Thread Create" and use the standard snapshot icon.

#### Scenario: threadcreate appears in snapshot group
- **WHEN** the user opens the profile type selector
- **THEN** "Thread Create" appears in the Snapshot group alongside block and mutex

### Requirement: Render threadcreate profile with existing views
The system SHALL render a captured `threadcreate` profile using the existing flame graph and call tree views without modification.

#### Scenario: View threadcreate flame graph
- **WHEN** the user opens a captured threadcreate profile
- **THEN** the flame graph renders the OS thread creation stack traces
- **AND** all standard interactions (zoom, search, tooltips) work as expected
