## MODIFIED Requirements

### Requirement: Profiling controls in connection detail
The system SHALL embed profiling controls directly in the connection detail page. The controls SHALL use the same Record/Snapshot grouped layout with duration input for CPU profiles.

#### Scenario: Collect CPU profile from connection detail
- **WHEN** user selects CPU, sets duration, and clicks Record on the connection detail page
- **THEN** system shows a progress bar during collection, and the completed profile appears in the profiles table below

#### Scenario: Capture snapshot from connection detail
- **WHEN** user selects a snapshot type and clicks Capture on the connection detail page
- **THEN** system captures the snapshot and it appears in the profiles table below
