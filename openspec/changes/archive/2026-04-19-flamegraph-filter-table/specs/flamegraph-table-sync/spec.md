## ADDED Requirements

### Requirement: Table filters on flame graph zoom
The top functions table SHALL display only functions present in the currently zoomed flame graph subtree when the user has zoomed into a node.

#### Scenario: User zooms into a flame graph node
- **WHEN** the user clicks a frame in the flame graph to zoom in
- **THEN** the top functions table updates to show only functions that appear within the zoomed subtree

#### Scenario: User resets zoom
- **WHEN** the user clicks "Reset Zoom" or zooms back to the root
- **THEN** the top functions table returns to showing all functions from the full profile

#### Scenario: Table values reflect zoomed scope
- **WHEN** the table is filtered to a zoomed subtree
- **THEN** percentage values in the table are recomputed relative to the zoomed subtree's total value

### Requirement: Filtered state indicator
The top functions table SHALL indicate when it is showing filtered results from a zoomed flame graph view.

#### Scenario: Filter indicator shown
- **WHEN** the user has zoomed into a flame graph node
- **THEN** a label showing the zoomed function name is displayed near the table header with a way to reset

#### Scenario: Filter indicator hidden at root
- **WHEN** the flame graph is at root level (no zoom)
- **THEN** no filter indicator is shown
