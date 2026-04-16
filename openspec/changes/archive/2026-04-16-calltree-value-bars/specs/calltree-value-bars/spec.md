## ADDED Requirements

### Requirement: Self vs children distribution bar
The system SHALL display a horizontal stacked bar in each call tree row showing the proportion of self time (orange) vs children time (blue). The bar width SHALL be proportional to the node's cumulative value relative to the profile total.

#### Scenario: Function with high self time
- **WHEN** a function has 80% self and 20% children
- **THEN** the bar shows a large orange segment and a small blue segment

#### Scenario: Function that mostly delegates
- **WHEN** a function has 5% self and 95% children
- **THEN** the bar shows a tiny orange segment and a large blue segment

#### Scenario: Leaf function (no children)
- **WHEN** a function has no children
- **THEN** the bar shows 100% orange (all self time)

### Requirement: Absolute/Relative value toggle
The system SHALL provide a toggle to switch all call tree value columns between absolute values (formatted time/bytes) and relative values (percentage of total).

#### Scenario: Switch to relative mode
- **WHEN** user clicks the "%" toggle
- **THEN** Self column shows percentage (e.g., "15.3%"), Cum column shows percentage, and the toggle appears active

#### Scenario: Switch to absolute mode
- **WHEN** user clicks the "Abs" toggle
- **THEN** Self column shows formatted values (e.g., "120ms"), Cum column shows formatted values

#### Scenario: Default mode
- **WHEN** user opens the call tree for the first time
- **THEN** absolute mode is active by default

### Requirement: Bar tooltip
The system SHALL show a tooltip on hover over the distribution bar displaying the exact self and children values.

#### Scenario: Hover over distribution bar
- **WHEN** user hovers over the bar
- **THEN** system displays a tooltip with "Self: 120ms (15.3%) | Children: 330ms (41.2%)"
