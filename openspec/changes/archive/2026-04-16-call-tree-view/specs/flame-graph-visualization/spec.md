## MODIFIED Requirements

### Requirement: Flame graph cross-linking with call tree
The system SHALL support bidirectional navigation between the flame graph and call tree views. Selecting a function in one view SHALL highlight it in the other.

#### Scenario: Click function in call tree
- **WHEN** user clicks a function name in the call tree and switches to the flame graph tab
- **THEN** system searches for that function in the flame graph, highlighting matching frames

#### Scenario: Click function in flame graph
- **WHEN** user clicks a function in the flame graph and switches to the call tree tab
- **THEN** system auto-expands and scrolls to that function in the call tree
