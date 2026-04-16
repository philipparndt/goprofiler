## ADDED Requirements

### Requirement: Collect execution trace
The system SHALL allow the user to start an execution trace on a connected target with a configurable duration (default 5 seconds). The system SHALL fetch data from the target's `/debug/pprof/trace?seconds=N` endpoint and store the raw binary response without parsing.

#### Scenario: Start trace with default duration
- **WHEN** user selects Trace from the Record group and clicks Start
- **THEN** system begins collecting trace data for 5 seconds, displays a progress indicator with remaining time, and saves the trace when complete

#### Scenario: Start trace with custom duration
- **WHEN** user sets duration to 15 seconds and starts a trace
- **THEN** system collects trace data for 15 seconds and saves the result

#### Scenario: Trace appears in profile list
- **WHEN** a trace collection completes
- **THEN** the trace appears in the profiles list with type "trace" and a distinct badge

### Requirement: Cancel active trace collection
The system SHALL allow the user to cancel an in-progress trace before its duration completes, using the same cancel mechanism as CPU profiling.

#### Scenario: Cancel trace early
- **WHEN** user clicks "Stop" during an active trace collection
- **THEN** system cancels the HTTP request to the target, discards partial data, and returns to the idle state

### Requirement: Trace download and instructions
The system SHALL display a download card in the profile viewer for trace-type profiles. The card SHALL provide a download button for the raw trace file and instructions for opening it with `go tool trace`.

#### Scenario: View trace profile
- **WHEN** user opens a trace profile in the profile viewer
- **THEN** system shows a download card instead of the flame graph view, with a "Download trace" button and instructions: `go tool trace <filename>.trace`

#### Scenario: Download trace file
- **WHEN** user clicks "Download trace" on the trace viewer card
- **THEN** system downloads the raw binary trace file with a `.trace` extension via the existing export endpoint

### Requirement: Trace type badge
The system SHALL display a distinct badge for trace-type profiles in all profile lists and the profile viewer header.

#### Scenario: Trace badge in profiles list
- **WHEN** a trace profile appears in a profile list
- **THEN** its type badge is visually distinct from CPU and snapshot badges and labelled "trace"
