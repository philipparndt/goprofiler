## ADDED Requirements

### Requirement: URL-based connection detail tabs
The system SHALL use URL routes for connection detail views. `/connections/:id/profiling` SHALL show the profiling view and `/connections/:id/monitor` SHALL show the memory monitor view.

#### Scenario: Navigate to profiling via URL
- **WHEN** user navigates to `/connections/:id/profiling`
- **THEN** system shows the profiling controls and profiles list for that connection

#### Scenario: Navigate to monitor via URL
- **WHEN** user navigates to `/connections/:id/monitor`
- **THEN** system shows the memory monitor chart for that connection

#### Scenario: Reload page on monitor
- **WHEN** user reloads the browser while on `/connections/:id/monitor`
- **THEN** system shows the memory monitor view (not the profiling view)

#### Scenario: Navigate to connection without tab
- **WHEN** user navigates to `/connections/:id`
- **THEN** system redirects to `/connections/:id/profiling`
