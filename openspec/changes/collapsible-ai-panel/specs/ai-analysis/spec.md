## ADDED Requirements

### Requirement: The AI analysis panel SHALL support collapsing without stopping the analysis

The panel MUST expose a user control that switches it from an expanded view to a compact collapsed view. Collapsing MUST NOT cancel the active analysis or drop the event subscription — the run continues in the background and any events produced while collapsed MUST still update the panel's internal state.

#### Scenario: Collapsing during an active run
- **WHEN** an analysis is producing events and the user activates the collapse control
- **THEN** the panel renders its compact collapsed view
- **AND** the underlying analysis process continues to run
- **AND** events received while collapsed continue to update the panel's content, activity, and session-ID state.

#### Scenario: Re-expanding shows current state
- **WHEN** the user activates the expand control while events have been received in the background
- **THEN** the panel renders its expanded view with the current accumulated content, the latest activity line, and the latest session ID
- **AND** the panel remains on the same analysis (no new run is started).

#### Scenario: Collapse is distinct from Cancel and Close
- **WHEN** the user collapses the panel
- **THEN** neither the analysis is cancelled nor the panel's state is cleared
- **AND** the existing Cancel control still stops the current turn without hiding the panel
- **AND** the existing Close control still cancels the analysis and removes the panel.

### Requirement: The collapsed view SHALL communicate analysis status at a glance

The collapsed view MUST show whether the analysis is running, has finished, or has errored, using a visual indicator that differentiates these three states without requiring the panel to be expanded.

#### Scenario: Running state
- **WHEN** the panel is collapsed and the analysis is still receiving events
- **THEN** the collapsed view shows a live/pulsing indicator and a "running" status label.

#### Scenario: Ready state
- **WHEN** the panel is collapsed and the analysis has produced its final result
- **THEN** the collapsed view shows an idle indicator and a "ready" status label.

#### Scenario: Error state
- **WHEN** the panel is collapsed and the analysis has emitted an error
- **THEN** the collapsed view shows an error-styled indicator and an "error" status label.

### Requirement: The collapsed view SHALL signal background completion or error

If the analysis completes or errors while the panel is collapsed, the collapsed view MUST show an unread-style indicator so the user knows something happened. Expanding the panel MUST clear the indicator.

#### Scenario: Run completes while collapsed
- **WHEN** the panel is collapsed while the run is active and the run subsequently finishes
- **THEN** the collapsed view additionally shows an unread marker alongside the status indicator.

#### Scenario: Expanding clears the unread marker
- **WHEN** the user expands the panel after a background completion
- **THEN** the unread marker is removed on the next render.

### Requirement: The collapsed view SHALL be operable by keyboard

The collapsed view MUST be focusable and activatable via keyboard with a descriptive accessible label so users can expand the panel without a mouse.

#### Scenario: Expand via keyboard
- **WHEN** the collapsed view has keyboard focus and the user activates it (Enter or Space)
- **THEN** the panel expands.

#### Scenario: Accessible label reflects state
- **WHEN** the collapsed view is focused by a screen reader
- **THEN** the announced label reflects the current status (running / ready / error).
