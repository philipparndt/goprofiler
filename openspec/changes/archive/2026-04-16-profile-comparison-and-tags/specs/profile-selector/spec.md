## ADDED Requirements

### Requirement: Compare action on profiles
The system SHALL provide a "Compare" button on each profile in the connection detail profiles table. Clicking it opens a comparison selector.

#### Scenario: Initiate comparison
- **WHEN** user clicks "Compare" on a CPU profile
- **THEN** system opens a selector showing other CPU profiles (same type) as candidates, with tag and timestamp info

### Requirement: Comparison selector
The system SHALL display a selector panel showing candidate profiles for comparison, filterable by tag. The selected base profile is shown at the top.

#### Scenario: Select compare profile
- **WHEN** user picks a candidate from the selector
- **THEN** system navigates to the diff viewer at `/profiles/diff?base=ID1&compare=ID2`

#### Scenario: Filter candidates by tag
- **WHEN** user selects tag "baseline" in the candidate filter
- **THEN** only profiles tagged "baseline" are shown as candidates

### Requirement: Diff viewer route
The system SHALL provide a route at `/profiles/diff` that accepts `base` and `compare` query parameters and renders the diff viewer.

#### Scenario: Navigate to diff
- **WHEN** user navigates to `/profiles/diff?base=abc&compare=xyz`
- **THEN** system loads both profiles, computes the diff, and renders the diff flame graph and call tree
