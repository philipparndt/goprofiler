## ADDED Requirements

### Requirement: Active connections in sidebar
The system SHALL display active connections in the sidebar below the Connections link. Each connection SHALL show its URL (truncated if needed) and two indented sub-items: Profiling and Monitor.

#### Scenario: One active connection
- **WHEN** there is one connected target at localhost:6060
- **THEN** sidebar shows "localhost:6060" with indented "Profiling" and "Monitor" links below it

#### Scenario: Multiple active connections
- **WHEN** there are multiple connected targets
- **THEN** sidebar shows each with its sub-items, ordered by URL

#### Scenario: No active connections
- **WHEN** there are no connected targets
- **THEN** sidebar shows only the static items (Dashboard, Connections, Setup) with no connection sub-items

### Requirement: Active state highlighting
The system SHALL highlight the current sidebar item based on the URL. When on `/connections/:id/monitor`, the corresponding connection's Monitor sub-item SHALL be highlighted.

#### Scenario: Highlight monitor sub-item
- **WHEN** user is on `/connections/abc-123/monitor`
- **THEN** the "Monitor" sub-item under the corresponding connection is highlighted with the active style

### Requirement: Connection status indicator in sidebar
Each connection in the sidebar SHALL show a small status dot (green for connected, red for unreachable).

#### Scenario: Connected target
- **WHEN** a target has status "connected"
- **THEN** sidebar shows a green dot next to its URL
