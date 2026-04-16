## MODIFIED Requirements

### Requirement: Connections list as primary entry point
The system SHALL display connections as clickable cards that navigate to the connection detail page. Each card SHALL show: target URL, status indicator, number of collected profiles, and last profile timestamp.

#### Scenario: Click connection card
- **WHEN** user clicks a connection card in the connections list
- **THEN** system navigates to `/connections/:id` showing the connection detail page

#### Scenario: Connections list with mixed active and saved
- **WHEN** user views the connections list with both active and saved targets
- **THEN** active connections appear first with green status dots, saved connections appear below with gray status

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
