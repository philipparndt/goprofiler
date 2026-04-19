## ADDED Requirements

### Requirement: Backend CPU data collection
The system SHALL collect CPU usage data from monitored Go processes by taking short CPU profiles via the `/debug/pprof/profile` endpoint at regular intervals. CPU monitoring SHALL be disabled by default and only collect data when explicitly enabled for a target. Collected data SHALL be stored in a rolling time-series buffer with the same 7200-point maximum as memory data.

#### Scenario: CPU data collected when enabled
- **WHEN** CPU monitoring is enabled for a target
- **THEN** the system takes a 1-second CPU profile every 5 seconds and stores the resulting CPU percentage data point

#### Scenario: CPU collection does not start automatically on connect
- **WHEN** a new target is connected
- **THEN** the CPU collector does NOT start polling until explicitly enabled

#### Scenario: CPU collection stops on target disconnect
- **WHEN** a target is disconnected
- **THEN** the CPU collector stops polling and releases resources for that target

### Requirement: CPU monitoring enable/disable API
The system SHALL expose API endpoints to enable and disable CPU monitoring per target.

#### Scenario: Enable CPU monitoring
- **WHEN** a client sends `POST /targets/{id}/cpu/enable`
- **THEN** the system starts CPU profile collection for that target and returns HTTP 200

#### Scenario: Disable CPU monitoring
- **WHEN** a client sends `POST /targets/{id}/cpu/disable`
- **THEN** the system stops CPU profile collection for that target and returns HTTP 200

#### Scenario: Enable CPU monitoring for unknown target
- **WHEN** a client sends `POST /targets/{id}/cpu/enable` for a non-existent target ID
- **THEN** the system returns HTTP 404

### Requirement: CPU history API endpoint
The system SHALL expose an HTTP endpoint to retrieve CPU usage history for a target, supporting incremental polling via a `since` query parameter.

#### Scenario: Full CPU history retrieval
- **WHEN** a client requests `GET /targets/{id}/cpu/history` without a `since` parameter
- **THEN** the system returns all stored CPU data points as JSON

#### Scenario: Incremental CPU history retrieval
- **WHEN** a client requests `GET /targets/{id}/cpu/history?since={timestamp}`
- **THEN** the system returns only CPU data points with timestamps after the given time

#### Scenario: CPU history for unknown target
- **WHEN** a client requests CPU history for a non-existent target ID
- **THEN** the system returns HTTP 404

### Requirement: CPU data point structure
Each CPU data point SHALL contain a timestamp and a CPU usage percentage value. The CPU percentage SHALL be calculated as the ratio of CPU sample time to wall clock time, allowing values above 100% for multi-core usage.

#### Scenario: CPU data point format
- **WHEN** a CPU data point is serialized to JSON
- **THEN** it contains `timestamp` (RFC3339Nano) and `cpuPercent` (float64) fields

### Requirement: Frontend CPU chart
The system SHALL display a real-time CPU usage chart in the Monitor tab alongside the existing memory chart. The chart SHALL use the same time window controls and canvas rendering approach as the memory chart.

#### Scenario: CPU chart shows enable toggle
- **WHEN** a user navigates to the Monitor tab for a connected target
- **THEN** a CPU monitoring section is visible with an enable/disable toggle, defaulting to disabled

#### Scenario: CPU chart displays when enabled
- **WHEN** the user enables CPU monitoring via the toggle
- **THEN** the CPU usage chart becomes visible and starts displaying data

#### Scenario: CPU chart updates in real-time
- **WHEN** the CPU chart is active
- **THEN** it polls the CPU history endpoint every 5 seconds and renders new data points

#### Scenario: CPU chart respects window duration
- **WHEN** the user selects a time window (1m, 5m, 15m, 30m, 1h, 2h)
- **THEN** the CPU chart displays only data within that window

#### Scenario: CPU chart shows hover tooltip
- **WHEN** the user hovers over the CPU chart
- **THEN** a tooltip displays the timestamp and CPU percentage at that position
