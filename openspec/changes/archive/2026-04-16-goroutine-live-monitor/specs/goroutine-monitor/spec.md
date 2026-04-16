## ADDED Requirements

### Requirement: Live goroutine count chart
The system SHALL display a real-time scrolling line chart in the Monitor tab showing goroutine count over time. The chart SHALL use the same canvas-based scrolling style as the memory chart, with a single amber line for goroutine count and a Y axis showing raw integer counts.

#### Scenario: Start monitoring
- **WHEN** user navigates to the Monitor tab on an active connection
- **THEN** system begins polling goroutine count every second and renders a scrolling chart that updates in real time alongside the memory chart

#### Scenario: Chart scrolling
- **WHEN** data exceeds the visible time window (last 300 data points, same ring buffer as memory chart)
- **THEN** older data scrolls off the left edge and the chart continuously moves right

#### Scenario: Hover tooltip
- **WHEN** user hovers over the goroutine chart
- **THEN** system displays a crosshair with the timestamp and exact goroutine count at that point

#### Scenario: Stop monitoring
- **WHEN** user navigates away from the Monitor tab or disconnects
- **THEN** system stops polling goroutine count

### Requirement: Goroutine count threshold line
The system SHALL render a horizontal dashed red line on the goroutine chart at a configurable warning threshold (default 1000 goroutines).

#### Scenario: Count below threshold
- **WHEN** all data points are below the threshold
- **THEN** the threshold line is visible as a subtle guide, no warning state is shown

#### Scenario: Count exceeds threshold
- **WHEN** the current goroutine count is above the threshold
- **THEN** a warning badge (e.g. "High goroutine count") appears on the chart card

### Requirement: Sustained growth warning
The system SHALL detect sustained monotonic goroutine growth and display a warning indicator.

#### Scenario: Monotonic growth detected
- **WHEN** the last 30 consecutive data points show a non-decreasing goroutine count with a total delta of at least 10 goroutines
- **THEN** a warning badge (e.g. "Goroutine growth detected") appears on the chart card

#### Scenario: Growth resolved
- **WHEN** the goroutine count stabilises or decreases
- **THEN** the growth warning badge is removed

### Requirement: Goroutine stack grouping table
The system SHALL provide an on-demand table showing the top goroutine groups by count, parsed from the goroutine pprof debug output.

#### Scenario: View goroutine groups
- **WHEN** user clicks the Refresh button in the goroutine groups table
- **THEN** system fetches the current goroutine groups from the backend and displays them sorted by count descending, showing at most 10 groups

#### Scenario: Table columns
- **WHEN** goroutine groups are displayed
- **THEN** each row shows: count, goroutine state (e.g. "chan receive"), top frame function name, and source location

#### Scenario: Expand stack trace
- **WHEN** user clicks on a goroutine group row
- **THEN** the full stack trace for that group is shown inline below the row

#### Scenario: Total count consistency
- **WHEN** the groups table is refreshed
- **THEN** the sum of all group counts equals the total goroutine count shown at the top of the table (which may differ from the chart's latest poll by a few seconds)

### Requirement: Goroutine count in shared polling response
The system SHALL include goroutine count in the existing memstats history endpoint response so both charts can be driven from a single polling loop on the frontend.

#### Scenario: History endpoint includes goroutine count
- **WHEN** the frontend polls `GET /api/targets/{id}/memstats/history`
- **THEN** each data point in the response includes a `numGoroutines` field with the goroutine count recorded at that timestamp

#### Scenario: Goroutine count fetch failure
- **WHEN** the goroutine count fetch fails during a poll cycle (network error or non-200 response)
- **THEN** the poll cycle records 0 for `numGoroutines` and continues without disrupting the memory chart data
