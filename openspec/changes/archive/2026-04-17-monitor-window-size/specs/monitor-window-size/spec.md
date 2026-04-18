## MODIFIED Requirements

### Requirement: Configurable monitor time window
The system SHALL allow users to select the time window for the memory and goroutine monitor charts from predefined options: 1m, 5m, 15m, 30m, 1h, 2h.

#### Scenario: Select 1 minute window
- **WHEN** user selects "1m"
- **THEN** charts show only the last 60 seconds of data, updating in real time

#### Scenario: Select 2 hour window
- **WHEN** user selects "2h"
- **THEN** charts show up to 2 hours of data, scrolling as new data arrives

#### Scenario: Default window
- **WHEN** user opens the monitor tab
- **THEN** the 5m window is selected by default

#### Scenario: Window larger than available data
- **WHEN** user selects "2h" but only 10 minutes of data has been collected
- **THEN** charts show all available data (10 minutes) without empty space on the left
