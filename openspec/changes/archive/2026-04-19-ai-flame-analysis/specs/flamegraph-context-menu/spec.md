## ADDED Requirements

### Requirement: Right-click context menu on flame graph
The system SHALL show a context menu when the user right-clicks on a frame in the flame graph.

#### Scenario: Context menu appears
- **WHEN** the user right-clicks a frame in the flame graph
- **THEN** a context menu appears with an "Explain this function" option

#### Scenario: Explain from context menu
- **WHEN** the user selects "Explain this function" from the context menu
- **THEN** Claude Code is spawned with a prompt focused on that specific function, its callers and callees, and the source directory

#### Scenario: Context menu without source directory
- **WHEN** the user right-clicks a frame but no source directory is configured
- **THEN** the "Explain this function" option is disabled with a note to configure source directory first

#### Scenario: Context menu dismissed
- **WHEN** the user clicks elsewhere or presses Escape
- **THEN** the context menu is dismissed
