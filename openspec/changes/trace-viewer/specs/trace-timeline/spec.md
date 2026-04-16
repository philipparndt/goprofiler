## ADDED Requirements

### Requirement: Goroutine timeline visualization
The system SHALL render an interactive timeline showing goroutine execution as horizontal swim lanes. Each goroutine occupies a row, with colored segments representing execution states: Running (green), Runnable (amber), Blocked (red), Syscall (purple), Waiting (gray).

#### Scenario: View trace timeline
- **WHEN** user opens a trace profile in the profile viewer
- **THEN** system parses the trace server-side and renders a canvas-based goroutine timeline with colored state segments

#### Scenario: Zoom into timeline
- **WHEN** user scrolls the mouse wheel over the timeline
- **THEN** the timeline zooms in/out centered on the cursor position, revealing finer time resolution

#### Scenario: Pan the timeline
- **WHEN** user clicks and drags on the timeline
- **THEN** the visible time window slides horizontally

#### Scenario: Click on a span
- **WHEN** user clicks on a colored segment in the timeline
- **THEN** system displays a detail panel showing: goroutine ID, state, duration, stack trace, and blocking reason (if applicable)

### Requirement: Timeline header with time axis
The system SHALL display a time axis at the top of the timeline showing timestamps relative to trace start (e.g., "0ms", "100ms", "1.5s"). The axis SHALL update as the user zooms/pans.

#### Scenario: Time axis updates on zoom
- **WHEN** user zooms into a 50ms window
- **THEN** the time axis shows millisecond-level ticks with appropriate labels

### Requirement: Goroutine labels
The system SHALL display goroutine labels on the left side of the timeline showing the goroutine ID and the function name where it was created.

#### Scenario: View goroutine label
- **WHEN** the timeline renders
- **THEN** each row shows "G{id}: {function}" on the left, with the creation function name truncated if too long

### Requirement: Virtual scrolling for large traces
The system SHALL use virtual scrolling to handle traces with many goroutines (100+). Only visible goroutine rows SHALL be rendered.

#### Scenario: Scroll through many goroutines
- **WHEN** a trace has 200 goroutines and the viewport shows 30
- **THEN** system only renders the 30 visible rows plus a buffer, scrolling smoothly through the full list

### Requirement: Minimap overview
The system SHALL display a minimap above the timeline showing the entire trace duration with a highlighted viewport rectangle. Clicking/dragging the minimap SHALL navigate the main timeline.

#### Scenario: Navigate via minimap
- **WHEN** user clicks a position on the minimap
- **THEN** the main timeline centers on that time position
