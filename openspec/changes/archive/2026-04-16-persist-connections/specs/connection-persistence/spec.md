## ADDED Requirements

### Requirement: Persist targets to JSON file
The system SHALL persist all known targets (active and saved) to `~/.config/goprofiler/connections.json`. The file SHALL be written atomically on every change (connect, disconnect, remove).

#### Scenario: File created on first connect
- **WHEN** user connects to a target and no connections.json exists
- **THEN** system creates `~/.config/goprofiler/connections.json` containing the target

#### Scenario: File updated on connect
- **WHEN** user connects to a new target
- **THEN** system appends the target to the JSON file with the current timestamp

### Requirement: Load saved targets on startup
The system SHALL load targets from `~/.config/goprofiler/connections.json` on startup. Loaded targets SHALL appear as "saved" (not active) until the user reconnects.

#### Scenario: Startup with existing connections file
- **WHEN** server starts and connections.json contains previously saved targets
- **THEN** targets are available in the saved targets list via the API

#### Scenario: Startup with no connections file
- **WHEN** server starts and connections.json does not exist
- **THEN** saved targets list is empty, no error occurs

#### Scenario: Startup with malformed connections file
- **WHEN** server starts and connections.json contains invalid JSON
- **THEN** system logs a warning and starts with an empty saved targets list
