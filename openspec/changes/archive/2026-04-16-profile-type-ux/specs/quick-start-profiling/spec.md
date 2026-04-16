## ADDED Requirements

### Requirement: New Profile action on Profiles page
The system SHALL display a prominent green "New Profile" button on the Profiles list page.

#### Scenario: Click New Profile with connected targets
- **WHEN** user clicks "New Profile" and there are connected targets
- **THEN** system shows an inline profiling card with: target selector (dropdown of connected targets), profile type selector (grouped into Record/Snapshot), duration input for CPU, and a Start button

#### Scenario: Click New Profile with no connected targets
- **WHEN** user clicks "New Profile" and there are no connected targets
- **THEN** system shows a message directing user to connect a target first, with a link to the Connections page

#### Scenario: Start profile from Profiles page
- **WHEN** user selects a target, profile type, and clicks Start
- **THEN** system collects the profile (showing progress for CPU) and the new profile appears in the list when complete

#### Scenario: Dismiss profiling card
- **WHEN** user clicks outside the profiling card or a close button
- **THEN** system hides the profiling card
