## ADDED Requirements

### Requirement: Start CPU profiling session
The system SHALL allow the user to start a CPU profiling session on a connected target with a configurable duration (default: 30 seconds). The system SHALL fetch data from the target's `/debug/pprof/profile?seconds=N` endpoint.

#### Scenario: Start CPU profile with default duration
- **WHEN** user selects a connected target and clicks "Start CPU Profile"
- **THEN** system begins collecting CPU profile data for 30 seconds, displays a progress indicator with remaining time, and saves the profile when complete

#### Scenario: Start CPU profile with custom duration
- **WHEN** user sets duration to 60 seconds and starts CPU profiling
- **THEN** system collects CPU profile data for 60 seconds

#### Scenario: Profile collection during high load
- **WHEN** the target application is under heavy load during profiling
- **THEN** system completes collection normally and the profile reflects the actual workload

### Requirement: Collect snapshot profiles
The system SHALL support collecting point-in-time snapshot profiles: heap, goroutine, block, and mutex. These are fetched as instant snapshots from the corresponding `/debug/pprof/<type>` endpoints.

#### Scenario: Collect heap profile
- **WHEN** user clicks "Capture Heap Profile" on a connected target
- **THEN** system fetches `/debug/pprof/heap`, parses the response, and saves the profile

#### Scenario: Collect goroutine profile
- **WHEN** user clicks "Capture Goroutine Profile"
- **THEN** system fetches `/debug/pprof/goroutine?debug=0` (binary protobuf), parses and saves the profile

#### Scenario: Collect all snapshot types
- **WHEN** user clicks "Capture All Snapshots"
- **THEN** system fetches heap, goroutine, block, and mutex profiles concurrently and saves each

### Requirement: Cancel active profiling session
The system SHALL allow the user to cancel an in-progress CPU profiling session before its duration completes.

#### Scenario: Cancel CPU profile early
- **WHEN** user clicks "Stop" during an active CPU profiling session
- **THEN** system cancels the HTTP request to the target, discards partial data, and returns to the idle state

### Requirement: Profile collection error handling
The system SHALL handle errors during profile collection gracefully.

#### Scenario: Target disconnects during profiling
- **WHEN** the target becomes unreachable during an active CPU profiling session
- **THEN** system displays an error message indicating the profile collection failed and the reason

#### Scenario: Profile endpoint returns error
- **WHEN** the pprof endpoint returns a non-200 status code
- **THEN** system displays the HTTP status and response body as an error message
