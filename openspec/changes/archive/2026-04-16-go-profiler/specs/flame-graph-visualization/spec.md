## ADDED Requirements

### Requirement: Render flame graph from profile
The system SHALL render an interactive flame graph visualization from any collected profile. The flame graph SHALL display function call stacks as horizontal bars, with width proportional to the sample count/value, stacked by call hierarchy.

#### Scenario: View CPU profile as flame graph
- **WHEN** user opens a collected CPU profile
- **THEN** system renders a flame graph showing function call stacks with width proportional to CPU time, colored by package

#### Scenario: View heap profile as flame graph
- **WHEN** user opens a collected heap profile
- **THEN** system renders a flame graph showing memory allocation stacks with width proportional to allocated bytes

### Requirement: Flame graph zoom and navigation
The system SHALL support zooming into flame graph subtrees for detailed inspection.

#### Scenario: Zoom into a frame
- **WHEN** user clicks on a frame in the flame graph
- **THEN** system zooms the view so that frame fills the full width, showing its children in detail, with a breadcrumb trail showing the zoom path

#### Scenario: Reset zoom
- **WHEN** user clicks "Reset Zoom" or the root breadcrumb
- **THEN** system returns to the full flame graph view

### Requirement: Flame graph search
The system SHALL support searching for function names within the flame graph, highlighting matching frames.

#### Scenario: Search for function name
- **WHEN** user types a search query (e.g., "json.Marshal")
- **THEN** system highlights all frames matching the query, dims non-matching frames, and displays the percentage of total time in matching frames

#### Scenario: Clear search
- **WHEN** user clears the search field
- **THEN** system restores all frames to their normal appearance

### Requirement: Flame graph tooltips
The system SHALL display detailed information when hovering over a flame graph frame.

#### Scenario: Hover over frame
- **WHEN** user hovers over a frame in the flame graph
- **THEN** system displays a tooltip showing: function name, package path, self time/value, cumulative time/value, percentage of total, and source file:line if available

### Requirement: Flame graph color scheme
The system SHALL use a visually distinctive color scheme that encodes meaningful information (e.g., color by package, or warm/cool gradient for hot/cold paths).

#### Scenario: Color by package
- **WHEN** flame graph is rendered with "color by package" mode (default)
- **THEN** frames from the same Go package share the same color, making it easy to identify which packages dominate the profile

#### Scenario: Color by heat
- **WHEN** user switches to "color by heat" mode
- **THEN** frames are colored on a warm-to-cool gradient based on self-time, with hottest frames in red/orange

### Requirement: Flame graph orientation
The system SHALL support both traditional flame graph (bottom-up, showing callers) and icicle graph (top-down, showing callees) orientations.

#### Scenario: Toggle orientation
- **WHEN** user clicks the orientation toggle
- **THEN** system switches between flame (bottom-up) and icicle (top-down) views, preserving the current zoom and search state

### Requirement: Diff flame graph
The system SHALL support rendering a diff flame graph comparing two profiles of the same type, highlighting regressions and improvements.

#### Scenario: Compare two CPU profiles
- **WHEN** user selects two CPU profiles and clicks "Compare"
- **THEN** system renders a diff flame graph where red indicates regression (more time), blue indicates improvement (less time), and width reflects the baseline profile
