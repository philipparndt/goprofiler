## ADDED Requirements

### Requirement: Arrow key navigation
The system SHALL support Up/Down arrow keys to move focus between visible call tree rows.

#### Scenario: Arrow Down from first row
- **WHEN** user presses Down arrow with focus on the first row
- **THEN** focus moves to the second visible row and the row scrolls into view if needed

#### Scenario: Arrow Up from last row
- **WHEN** user presses Up arrow with focus on the last visible row
- **THEN** focus moves to the previous row

#### Scenario: Arrow Down at last row
- **WHEN** user presses Down arrow with focus on the last visible row
- **THEN** focus stays on the last row (no wrap)

### Requirement: Expand and collapse with arrow keys
The system SHALL support Left/Right arrow keys to collapse/expand tree nodes.

#### Scenario: Right arrow on collapsed node with children
- **WHEN** user presses Right arrow on a collapsed node that has children
- **THEN** the node expands to show its children

#### Scenario: Right arrow on expanded node
- **WHEN** user presses Right arrow on an already expanded node
- **THEN** focus moves to the first child

#### Scenario: Right arrow on leaf node
- **WHEN** user presses Right arrow on a leaf node (no children)
- **THEN** nothing happens

#### Scenario: Left arrow on expanded node
- **WHEN** user presses Left arrow on an expanded node
- **THEN** the node collapses

#### Scenario: Left arrow on collapsed node
- **WHEN** user presses Left arrow on a collapsed node or leaf
- **THEN** focus moves to the parent node

### Requirement: Select with Enter
The system SHALL select the focused row (triggering cross-linking) when Enter or Space is pressed.

#### Scenario: Press Enter on focused row
- **WHEN** user presses Enter on a focused row
- **THEN** the function is selected and passed to the flame graph cross-linking

### Requirement: Home and End navigation
The system SHALL support Home/End keys to jump to the first/last visible row.

#### Scenario: Press Home
- **WHEN** user presses Home
- **THEN** focus moves to the first visible row

#### Scenario: Press End
- **WHEN** user presses End
- **THEN** focus moves to the last visible row

### Requirement: Expand all children
The system SHALL support the `*` key to expand all descendants of the focused node.

#### Scenario: Press asterisk on node with nested children
- **WHEN** user presses `*` on a node with children
- **THEN** the node and all its descendants are expanded

### Requirement: Visual focus indicator
The system SHALL display a visible focus indicator on the currently focused row, distinct from the selection highlight.

#### Scenario: Focus indicator visible
- **WHEN** a row has keyboard focus
- **THEN** it displays a left accent border and subtle background tint
