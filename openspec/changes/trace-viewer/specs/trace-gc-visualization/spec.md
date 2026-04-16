## ADDED Requirements

### Requirement: GC event overlay on timeline
The system SHALL render GC events as semi-transparent red bands spanning the full height of the goroutine timeline. The band width represents GC duration.

#### Scenario: GC visible on timeline
- **WHEN** a trace contains GC events
- **THEN** light red vertical bands appear at GC timestamps across all goroutine rows

#### Scenario: Hover over GC band
- **WHEN** user hovers over a GC band
- **THEN** system shows a tooltip with: GC number, start time, duration, and pause time

### Requirement: Heap size chart synced with timeline
The system SHALL display a heap size area chart below the goroutine timeline, time-synced so that zooming/panning the timeline also zooms/pans the heap chart.

#### Scenario: Heap chart correlation
- **WHEN** user zooms into a section of the timeline where a GC occurs
- **THEN** the heap chart shows the sawtooth pattern of allocation and GC at the same time scale

### Requirement: GC summary statistics
The system SHALL display GC summary statistics: total GC count, total pause time, average pause, max pause, GC CPU fraction.

#### Scenario: View GC summary
- **WHEN** user views a trace with GC events
- **THEN** system shows a compact GC stats bar above or below the timeline
