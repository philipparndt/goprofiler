## MODIFIED Requirements

### Requirement: Show delta after heap refresh
The system SHALL display delta values in the heap summary bar after a snapshot refresh, showing the change from the previous snapshot.

#### Scenario: Memory increased after refresh
- **WHEN** user refreshes a heap profile and inuse went from 10 MB to 12.3 MB
- **THEN** the In Use stat shows "12.3 MB" with "+2.3 MB" in red below it

#### Scenario: Memory decreased after refresh
- **WHEN** user refreshes and inuse dropped from 15 MB to 12 MB
- **THEN** the In Use stat shows "12.0 MB" with "-3.0 MB" in green below it

#### Scenario: No delta on first load
- **WHEN** user opens a heap profile for the first time (no refresh yet)
- **THEN** no delta values are shown
