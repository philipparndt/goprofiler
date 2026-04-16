## ADDED Requirements

### Requirement: Collect allocs snapshot profile
The system SHALL support collecting an allocs profile as a point-in-time snapshot. The backend SHALL fetch `/debug/pprof/allocs` from the target and store the result using the same pipeline as other snapshot profile types.

#### Scenario: Capture allocs profile
- **WHEN** user selects "Allocs" from the snapshot profile type selector and clicks "Capture"
- **THEN** system fetches `/debug/pprof/allocs` from the connected target, parses the pprof response, saves the profile with type `"allocs"`, and adds it to the profiles list

#### Scenario: Allocs profile appears in snapshot group
- **WHEN** user opens the profile type selector on the Connections page or the New Profile panel
- **THEN** "Allocs" appears in the Snapshot group alongside Heap, Goroutine, Block, and Mutex

#### Scenario: Capture all snapshots includes allocs
- **WHEN** user clicks "Capture All Snapshots"
- **THEN** system fetches heap, allocs, goroutine, block, and mutex profiles concurrently and saves each

### Requirement: View allocs profile as flame graph and call tree
The system SHALL render an allocs profile in the flame graph and call tree views using the same visualization as other snapshot profile types.

#### Scenario: Open allocs profile flame graph
- **WHEN** user opens a saved allocs profile
- **THEN** system displays the flame graph with cumulative allocation samples, with the same zoom, search, and tooltip behavior as other profile types

#### Scenario: Allocs profile type badge
- **WHEN** an allocs profile appears in the profiles list or profile viewer
- **THEN** its type badge displays `"allocs"` with the snapshot (camera) icon

### Requirement: Filter profiles list by allocs type
The system SHALL allow filtering the profiles list to show only allocs profiles.

#### Scenario: Filter by allocs
- **WHEN** user selects "allocs" in the profile type filter on the Profiles list page
- **THEN** only allocs profiles are shown in the list
