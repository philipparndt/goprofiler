## ADDED Requirements

### Requirement: Configure source directory per target
The system SHALL allow users to configure a local source directory path for each connected target in the Wails desktop app.

#### Scenario: Set source directory
- **WHEN** the user opens the connection detail view and enters a source directory path
- **THEN** the path is saved and associated with that target

#### Scenario: Source directory persisted across sessions
- **WHEN** a source directory is configured for a target and the app is restarted
- **THEN** the source directory path is restored for that target

#### Scenario: Browse for source directory
- **WHEN** the user clicks a browse button next to the source directory input
- **THEN** a native directory picker dialog opens to select a folder

### Requirement: Validate source directory
The system SHALL validate that the configured source directory exists and contains Go source files.

#### Scenario: Valid directory
- **WHEN** the user sets a path that exists and contains .go files
- **THEN** the path is accepted and saved

#### Scenario: Invalid directory
- **WHEN** the user sets a path that does not exist
- **THEN** a warning is shown but the path is still saved (directory may be created later)
