## ADDED Requirements

### Requirement: Live memory usage chart
The system SHALL display a real-time scrolling line chart on the connection detail page showing memory usage over time. The chart SHALL display three lines: HeapAlloc (live heap usage), HeapSys (heap memory reserved from OS), and Sys (total memory from OS).

#### Scenario: Start monitoring
- **WHEN** user navigates to the Monitor tab on an active connection
- **THEN** system begins polling MemStats every second and renders a scrolling chart that updates in real time

#### Scenario: Chart scrolling
- **WHEN** data exceeds the visible time window (default 5 minutes)
- **THEN** older data scrolls off the left edge and the chart continuously moves right

#### Scenario: Stop monitoring
- **WHEN** user navigates away from the Monitor tab or disconnects
- **THEN** system stops polling

### Requirement: Memory value formatting
The system SHALL display memory values in human-readable format (KB, MB, GB) on the Y axis and in tooltips.

#### Scenario: Hover over chart
- **WHEN** user hovers over the chart
- **THEN** system displays a crosshair with the timestamp and exact values for HeapAlloc, HeapSys, and Sys at that point

### Requirement: Chart legend
The system SHALL display a legend showing which color corresponds to which metric, with the current (latest) value shown next to each label.

#### Scenario: View legend
- **WHEN** the chart is active
- **THEN** a legend shows: HeapAlloc (with color and current value), HeapSys (with color and current value), Sys (with color and current value)
