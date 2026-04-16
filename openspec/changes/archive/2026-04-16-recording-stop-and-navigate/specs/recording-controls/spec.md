## ADDED Requirements

### Requirement: Stop recording early
The system SHALL allow the user to stop a CPU or trace recording early and save the data collected so far.

#### Scenario: Stop CPU recording after 10 seconds of a 30 second recording
- **WHEN** user clicks "Stop" during an active CPU recording
- **THEN** system stops the recording, saves the profile with data collected so far, and navigates to the profile viewer

#### Scenario: Stop with insufficient data
- **WHEN** user clicks "Stop" less than 1 second into a recording and no data was captured
- **THEN** system shows a message "Recording stopped but no data was captured. Try a longer recording."

#### Scenario: Cancel still discards
- **WHEN** user clicks "Cancel" during an active recording
- **THEN** system aborts the recording and discards all data (existing behavior)

### Requirement: Two distinct buttons during recording
The system SHALL show both a "Stop" button (to save partial data) and a "Cancel" button (to discard) during active CPU and trace recordings.

#### Scenario: Button layout during recording
- **WHEN** a CPU or trace recording is in progress
- **THEN** system shows a green "Stop" button and a red "Cancel" button next to the progress bar

### Requirement: Auto-navigate to results
The system SHALL automatically navigate to the profile viewer after any successful profile collection (recording or snapshot).

#### Scenario: CPU recording completes
- **WHEN** a CPU recording finishes (either full duration or stopped early)
- **THEN** system navigates to `/profiles/{id}` showing the flame graph

#### Scenario: Snapshot captured
- **WHEN** a heap/goroutine/block/mutex/allocs snapshot is captured
- **THEN** system navigates to `/profiles/{id}` showing the flame graph

#### Scenario: All snapshots captured
- **WHEN** "All Snapshots" is captured (multiple profiles)
- **THEN** system refreshes the profiles list (no single profile to navigate to)
