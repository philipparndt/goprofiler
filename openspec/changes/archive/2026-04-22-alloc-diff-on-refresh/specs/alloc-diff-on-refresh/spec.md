## ADDED Requirements

### Requirement: Show new allocations after refresh
The system SHALL compute a diff of alloc_space values between the previous and current heap snapshot after a refresh and make it available in the flame graph and call tree.

#### Scenario: Refresh and view new allocations
- **WHEN** user refreshes a heap profile and clicks "New allocations" toggle
- **THEN** the flame graph shows only allocations that happened between the two snapshots, with the diff color scheme

#### Scenario: Toggle back to absolute view
- **WHEN** user clicks "Absolute" toggle
- **THEN** the flame graph returns to showing the current snapshot's absolute values

#### Scenario: No toggle on first load
- **WHEN** user opens a heap profile for the first time (no refresh)
- **THEN** the "New allocations" toggle is not shown
