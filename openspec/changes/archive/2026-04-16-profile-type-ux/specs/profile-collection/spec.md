## MODIFIED Requirements

### Requirement: Profile type selector with recording/snapshot distinction
The system SHALL display profile types in two visually distinct groups: "Record" (CPU with a record-dot icon) and "Snapshot" (Heap, Goroutine, Block, Mutex with a camera/snapshot icon). Duration input SHALL only appear when a recording type is selected.

#### Scenario: Select CPU profile type
- **WHEN** user selects CPU from the Record group
- **THEN** system shows a duration input field next to the type selector

#### Scenario: Select snapshot profile type
- **WHEN** user selects Heap, Goroutine, Block, or Mutex from the Snapshot group
- **THEN** system hides the duration input field

### Requirement: Profile type badges with icons
The system SHALL display profile type badges in lists with a visual indicator distinguishing recording from snapshot types. Recording types (CPU) SHALL show a record-dot icon. Snapshot types SHALL show a camera icon.

#### Scenario: CPU profile badge
- **WHEN** a CPU profile appears in any list
- **THEN** its type badge includes a red record-dot icon prefix

#### Scenario: Snapshot profile badge
- **WHEN** a heap/goroutine/block/mutex profile appears in any list
- **THEN** its type badge includes a camera icon prefix
