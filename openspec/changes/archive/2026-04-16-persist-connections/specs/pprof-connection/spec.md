## MODIFIED Requirements

### Requirement: Disconnect from target
The system SHALL allow the user to disconnect from a connected target at any time. Disconnecting SHALL move the target to the saved list rather than deleting it.

#### Scenario: Disconnect while idle
- **WHEN** user clicks "Disconnect" on a connected target with no active profiling session
- **THEN** system marks the target as saved (inactive) and it appears in the saved targets section

#### Scenario: Disconnect while profiling
- **WHEN** user clicks "Disconnect" on a target with an active profiling session
- **THEN** system stops the active profiling session, saves any collected data, and marks the target as saved

### Requirement: Save connection targets
The system SHALL persist previously used connection targets so the user can reconnect quickly without re-entering URLs. Targets SHALL be persisted across server restarts.

#### Scenario: Reconnect to saved target
- **WHEN** user opens the connection panel
- **THEN** system displays a list of saved (inactive) targets with their URLs and last-connected timestamps, with a "Reconnect" button

#### Scenario: Reconnect action
- **WHEN** user clicks "Reconnect" on a saved target
- **THEN** system validates the pprof endpoint and moves the target to the active connections list

#### Scenario: Remove saved target
- **WHEN** user clicks "Remove" on a saved target
- **THEN** system permanently deletes the target from the saved list and the connections file
