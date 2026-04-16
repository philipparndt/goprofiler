## ADDED Requirements

### Requirement: Diff flame graph
The system SHALL render a diff flame graph comparing two profiles. Frame width represents the base profile values. Color indicates the direction of change: red for regression (increase), blue for improvement (decrease), gray for unchanged.

#### Scenario: Compare two heap profiles
- **WHEN** user compares a baseline heap profile with an under-load heap profile
- **THEN** system shows a diff flame graph where red frames indicate memory allocation increases and blue frames indicate decreases

#### Scenario: Hover on diff frame
- **WHEN** user hovers over a frame in the diff flame graph
- **THEN** tooltip shows: function name, base value, compare value, delta (absolute and percentage)

### Requirement: Diff call tree
The system SHALL render a diff call tree showing per-function deltas. Columns: Function, Base, Compare, Delta, Delta %. Red text for increases, green for decreases. Sortable by delta to find biggest changes.

#### Scenario: Sort by delta
- **WHEN** user clicks the "Delta" column header
- **THEN** functions are sorted by absolute delta descending, showing the biggest regressions first

#### Scenario: Filter significant changes
- **WHEN** user toggles "Hide unchanged"
- **THEN** functions with zero or near-zero delta are hidden

### Requirement: Comparison summary
The system SHALL display a summary at the top of the diff viewer showing: base profile info, compare profile info, total delta (e.g., "+15.3 MB heap" or "+120ms CPU"), and overall change percentage.

#### Scenario: View comparison summary
- **WHEN** user views a diff
- **THEN** system shows: "Base: heap baseline 2024-01-15 | Compare: heap under-load 2024-01-15 | Delta: +15.3 MB (+48.2%)"
