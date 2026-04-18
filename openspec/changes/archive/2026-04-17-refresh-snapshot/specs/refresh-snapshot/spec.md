## ADDED Requirements

### Requirement: Refresh snapshot in profile viewer
The system SHALL provide a "Refresh" button in the profile viewer header for snapshot profile types that re-captures the profile and updates the view in place.

#### Scenario: Refresh heap snapshot
- **WHEN** user clicks Refresh on a heap profile
- **THEN** system captures a new heap snapshot from the same target, overwrites the data, updates the timestamp, and reloads the flame graph/call tree

#### Scenario: Refresh preserves metadata
- **WHEN** user refreshes a profile that has tags and a label
- **THEN** the tags and label are preserved after refresh

#### Scenario: Refresh not available for recordings
- **WHEN** user views a CPU or trace profile
- **THEN** the Refresh button is not shown

#### Scenario: Target unreachable
- **WHEN** user clicks Refresh but the target is no longer reachable
- **THEN** system shows an error message and keeps the existing data
