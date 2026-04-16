## ADDED Requirements

### Requirement: Expvar availability detection
The system SHALL probe `/debug/vars` on the target when a connection is established and during periodic health checks. The result SHALL be stored as an `expvarAvailable` boolean on the `Target` object and included in all API responses that return a target.

#### Scenario: Target exposes expvar
- **WHEN** a target is connected and its `/debug/vars` endpoint returns HTTP 200
- **THEN** the target's `expvarAvailable` field is set to `true`

#### Scenario: Target does not expose expvar
- **WHEN** a target is connected and its `/debug/vars` endpoint is absent or returns a non-200 status
- **THEN** the target's `expvarAvailable` field is set to `false`

#### Scenario: Expvar availability changes after connect
- **WHEN** the periodic health check runs and the `/debug/vars` availability has changed since the last check
- **THEN** the `expvarAvailable` field is updated to reflect the current state

### Requirement: Expvar tab visibility
The system SHALL show an "Expvar" tab on the connection detail page only when the connected target's `expvarAvailable` field is `true`. The tab SHALL NOT appear for targets where expvar is unavailable.

#### Scenario: Target has expvar
- **WHEN** the user opens a connection detail page for a target where `expvarAvailable` is `true`
- **THEN** an "Expvar" tab is visible alongside the existing Profiling and Monitor tabs

#### Scenario: Target does not have expvar
- **WHEN** the user opens a connection detail page for a target where `expvarAvailable` is `false`
- **THEN** no "Expvar" tab is shown

### Requirement: Fetch expvar metrics
The system SHALL expose a backend endpoint that proxies `/debug/vars` from the target and returns the metrics as structured JSON including a server-side timestamp.

#### Scenario: Successful fetch
- **WHEN** the frontend polls `GET /api/targets/{id}/expvars`
- **THEN** the backend fetches the target's `/debug/vars`, wraps the result with a timestamp, and returns HTTP 200 with the structured payload

#### Scenario: Target unreachable during fetch
- **WHEN** the backend cannot reach the target's `/debug/vars` during a poll
- **THEN** the backend returns HTTP 502 and the frontend displays a stale-data indicator without clearing the existing metric values

### Requirement: Metrics table display
The system SHALL display all expvar metrics in a table with columns for metric name, type, and current value. The table SHALL update automatically every 2 seconds while the Expvar tab is active, and SHALL stop polling when the tab is not active.

#### Scenario: View metrics table
- **WHEN** the user navigates to the Expvar tab on an active connection
- **THEN** the system fetches expvar data immediately and renders a table showing each metric's name, inferred type (Number, String, Map), and current value

#### Scenario: Polling starts and stops with tab visibility
- **WHEN** the user switches to the Expvar tab
- **THEN** polling begins at 2-second intervals
- **WHEN** the user navigates away from the Expvar tab
- **THEN** polling stops

### Requirement: Sparklines for numeric metrics
The system SHALL render an inline sparkline chart for each metric whose current value is a JSON number. The sparkline SHALL represent the last 60 polled values (up to 2 minutes of history at 2-second intervals).

#### Scenario: Numeric metric with enough history
- **WHEN** a numeric metric has been polled at least twice
- **THEN** a small sparkline appears in the metric row showing the trend of recent values

#### Scenario: Sparkline on first poll
- **WHEN** a numeric metric has only one sample
- **THEN** the sparkline is shown as a flat line (single point, no trend yet)

#### Scenario: Ring buffer cap
- **WHEN** more than 60 samples have been collected for a metric
- **THEN** the oldest samples are dropped and only the most recent 60 are retained in the sparkline

### Requirement: Expandable map metrics
The system SHALL render `expvar.Map` values (JSON objects) as collapsible rows in the metrics table. Maps SHALL be collapsed by default, showing only the key count. Expanding a map SHALL reveal its key/value pairs as indented child rows.

#### Scenario: Expand a map metric
- **WHEN** the user clicks the expand toggle on a map metric row
- **THEN** the row expands to show each key/value pair as an indented child row

#### Scenario: Collapse a map metric
- **WHEN** the user clicks the collapse toggle on an expanded map metric row
- **THEN** the child rows are hidden and only the summary (key count) is shown

#### Scenario: Nested map within a map
- **WHEN** a map metric contains a value that is itself a JSON object
- **THEN** the nested object is also rendered as an expandable row within the parent map's expanded view

### Requirement: Unknown and non-standard metric values
The system SHALL display metrics whose JSON value is not a number, string, or object (e.g., arrays, nulls, or `expvar.Func` output with unusual shapes) as a raw JSON string in the value column, with type shown as "Raw".

#### Scenario: Array-valued expvar metric
- **WHEN** a metric's value is a JSON array (e.g., the built-in `cmdline` metric)
- **THEN** the value is displayed as a formatted JSON string and the type column shows "Raw"
