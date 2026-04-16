## ADDED Requirements

### Requirement: GC event markers
The system SHALL display vertical markers on the memory chart at timestamps where garbage collection events occurred. Each marker SHALL indicate the GC pause duration.

#### Scenario: GC occurs during monitoring
- **WHEN** a garbage collection event is detected (NumGC increases between polls)
- **THEN** a vertical dashed line appears on the chart at the current timestamp

#### Scenario: Hover over GC marker
- **WHEN** user hovers over a GC marker
- **THEN** system displays a tooltip showing: "GC #N - Pause: Xms"

### Requirement: GC stats summary
The system SHALL display a summary of GC activity below the chart showing: total GC count, average pause time, and total pause time during the monitoring session.

#### Scenario: View GC summary
- **WHEN** monitoring is active and GCs have occurred
- **THEN** system displays: "GC events: N | Avg pause: Xms | Total pause: Xms"
