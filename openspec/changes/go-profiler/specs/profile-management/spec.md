## ADDED Requirements

### Requirement: Store collected profiles
The system SHALL persist all collected profiles to the local filesystem with metadata (target URL, profile type, timestamp, duration, file size).

#### Scenario: Profile auto-saved after collection
- **WHEN** a profiling session completes successfully
- **THEN** system saves the raw pprof protobuf file and metadata to the data directory, and the profile appears in the profile list

### Requirement: List profiles
The system SHALL display a list of all collected profiles, sortable and filterable by target, type, and timestamp.

#### Scenario: View profile history
- **WHEN** user navigates to the profiles list
- **THEN** system displays all stored profiles with columns: target, type, timestamp, duration, size -- sorted by most recent first

#### Scenario: Filter by profile type
- **WHEN** user filters the profile list to "CPU" profiles only
- **THEN** system displays only CPU profiles

#### Scenario: Filter by target
- **WHEN** user filters the profile list by a specific target URL
- **THEN** system displays only profiles collected from that target

### Requirement: Delete profiles
The system SHALL allow the user to delete stored profiles.

#### Scenario: Delete single profile
- **WHEN** user selects a profile and clicks "Delete"
- **THEN** system removes the profile file and metadata, and the profile disappears from the list

#### Scenario: Bulk delete profiles
- **WHEN** user selects multiple profiles and clicks "Delete Selected"
- **THEN** system removes all selected profiles

### Requirement: Export profile
The system SHALL allow the user to download the raw pprof protobuf file for use with external tools (e.g., `go tool pprof`).

#### Scenario: Download raw profile
- **WHEN** user clicks "Export" on a profile
- **THEN** system downloads the raw `.pb.gz` file to the user's browser

### Requirement: Label profiles
The system SHALL allow users to add a text label/note to a profile for identification.

#### Scenario: Add label to profile
- **WHEN** user edits the label field on a profile and saves
- **THEN** system persists the label and displays it in the profile list
