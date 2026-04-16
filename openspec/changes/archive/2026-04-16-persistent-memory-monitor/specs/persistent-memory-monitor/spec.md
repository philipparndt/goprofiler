## ADDED Requirements

### Requirement: Automatic MemStats collection on connect
The system SHALL automatically start collecting MemStats from a target when it connects and stop when it disconnects. Collection SHALL resume on reconnect, appending to existing data.

#### Scenario: Connect starts collection
- **WHEN** user connects to a target
- **THEN** backend begins polling MemStats every second without user action

#### Scenario: Disconnect stops collection
- **WHEN** user disconnects a target
- **THEN** backend stops polling but retains the collected data

#### Scenario: Reconnect resumes collection
- **WHEN** user reconnects a previously disconnected target
- **THEN** backend resumes polling and new data points are appended to the existing history

### Requirement: Server-side ring buffer
The system SHALL store MemStats time-series data in a server-side ring buffer (last 300 points per target), keyed by target URL.

#### Scenario: Buffer full
- **WHEN** the ring buffer reaches 300 points
- **THEN** the oldest point is discarded as new points are added

### Requirement: History API with incremental updates
The system SHALL provide `GET /api/targets/{id}/memstats/history` that returns the full time-series. An optional `since` query parameter SHALL return only points after that timestamp.

#### Scenario: Initial load
- **WHEN** frontend requests history without `since`
- **THEN** system returns all buffered data points and GC events

#### Scenario: Incremental poll
- **WHEN** frontend requests history with `since=<timestamp>`
- **THEN** system returns only data points collected after that timestamp

### Requirement: Frontend loads history on mount
The system SHALL load the full monitoring history when the Memory Monitor tab is opened, showing data that was collected while the user was on other pages.

#### Scenario: Open monitor tab after profiling
- **WHEN** user has been on the Profiling tab for 2 minutes then switches to Memory Monitor
- **THEN** the chart immediately shows 2 minutes of data that was collected in the background
