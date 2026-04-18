## ADDED Requirements

### Requirement: Compact mode toggle
The system SHALL provide a "Compact" checkbox in the trace timeline toolbar that collapses empty gaps when enabled.

#### Scenario: Enable compact mode with filtered states
- **WHEN** user enables compact mode while "waiting" state is hidden
- **THEN** gaps between bursts of visible activity are collapsed to narrow break markers, and the timeline fits the visible content more tightly

#### Scenario: Disable compact mode
- **WHEN** user disables compact mode
- **THEN** the timeline returns to the full linear time representation

### Requirement: Break markers with duration labels
The system SHALL render collapsed gaps as visual break markers showing the skipped duration.

#### Scenario: View break marker
- **WHEN** a 500ms gap is collapsed
- **THEN** a narrow column with a hatch pattern and "~500ms" label appears in the timeline

### Requirement: Compact mode with no filters
The system SHALL also work when all states are visible -- it compacts gaps where no goroutine has any activity (e.g., the application was idle).

#### Scenario: Compact with all states visible
- **WHEN** user enables compact mode with no state filters
- **THEN** gaps where no goroutine has any span are collapsed (rare but possible in traces with idle periods)
