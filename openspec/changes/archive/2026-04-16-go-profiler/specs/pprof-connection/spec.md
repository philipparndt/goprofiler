## ADDED Requirements

### Requirement: Connect to pprof endpoint
The system SHALL allow the user to connect to a remote Go application by specifying the pprof base URL (e.g., `http://localhost:6060`). The system SHALL validate connectivity by fetching `/debug/pprof/` and confirming a successful response.

#### Scenario: Successful connection
- **WHEN** user enters a valid pprof URL and clicks "Connect"
- **THEN** system verifies the endpoint is reachable, displays a success indicator, and shows the target in the active connections list

#### Scenario: Connection failure
- **WHEN** user enters an unreachable or invalid URL
- **THEN** system displays a clear error message indicating the connection failed with the reason (timeout, refused, invalid response)

#### Scenario: Non-pprof endpoint
- **WHEN** user connects to a URL that responds with HTTP 200 but does not serve pprof data
- **THEN** system displays an error indicating the endpoint does not appear to be a pprof endpoint

### Requirement: Disconnect from target
The system SHALL allow the user to disconnect from a connected target at any time.

#### Scenario: Disconnect while idle
- **WHEN** user clicks "Disconnect" on a connected target with no active profiling session
- **THEN** system removes the target from the active connections list

#### Scenario: Disconnect while profiling
- **WHEN** user clicks "Disconnect" on a target with an active profiling session
- **THEN** system stops the active profiling session, saves any collected data, and removes the target from the active connections list

### Requirement: Save connection targets
The system SHALL persist previously used connection targets so the user can reconnect quickly without re-entering URLs.

#### Scenario: Reconnect to saved target
- **WHEN** user opens the connection panel
- **THEN** system displays a list of previously connected targets with their URLs and last-connected timestamps

#### Scenario: Remove saved target
- **WHEN** user deletes a saved target from the list
- **THEN** system removes it from the persisted targets

### Requirement: Health check for connected targets
The system SHALL periodically check connectivity to active targets and update their status indicator.

#### Scenario: Target becomes unreachable
- **WHEN** a connected target stops responding to health checks
- **THEN** system updates the target status to "unreachable" with a visual warning indicator

#### Scenario: Target recovers
- **WHEN** a previously unreachable target starts responding again
- **THEN** system updates the target status back to "connected"
