## ADDED Requirements

### Requirement: Tooltip shows absolute value
The flame graph tooltip SHALL display the absolute value of the hovered frame, formatted according to the profile type (bytes for heap/allocs, duration for CPU, count for others).

#### Scenario: Heap profile tooltip
- **WHEN** the user hovers over a frame in a heap profile flame graph
- **THEN** the tooltip displays the function name, absolute value in bytes (e.g., "24.3 MB"), percentage of total, and sample count

#### Scenario: CPU profile tooltip
- **WHEN** the user hovers over a frame in a CPU profile flame graph
- **THEN** the tooltip displays the function name, absolute value as duration (e.g., "150ms"), percentage of total, and sample count

#### Scenario: Other profile type tooltip
- **WHEN** the user hovers over a frame in a goroutine/block/mutex profile flame graph
- **THEN** the tooltip displays the function name, sample count, and percentage of total

### Requirement: Tooltip shows percentage
The flame graph tooltip SHALL display the percentage of the hovered frame's value relative to the root node's total value.

#### Scenario: Percentage calculation
- **WHEN** a frame has value 500 and the root has value 2000
- **THEN** the tooltip shows "25.0%"

### Requirement: Tooltip styling
The tooltip SHALL be visually consistent with the existing application theme (dark background, readable text, monospace for values).

#### Scenario: Tooltip appearance
- **WHEN** the user hovers over any frame
- **THEN** the tooltip appears with the function name prominently displayed and values below in a compact layout
