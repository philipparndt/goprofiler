## ADDED Requirements

### Requirement: Connection detail page
The system SHALL provide a connection detail page at `/connections/:id` showing the target's status, profiling controls, and collected profiles.

#### Scenario: View active connection detail
- **WHEN** user navigates to `/connections/:id` for a connected target
- **THEN** system displays: connection status bar (URL, green status dot, Disconnect button), profiling controls (Record/Snapshot groups, duration input, Start button), and a profiles table filtered to this target

#### Scenario: View saved connection detail
- **WHEN** user navigates to `/connections/:id` for a saved (disconnected) target
- **THEN** system displays: connection status bar with "Saved" status and Reconnect button, no profiling controls (disabled), and previously collected profiles from this target

#### Scenario: Start profiling from detail page
- **WHEN** user selects a profile type and clicks Start/Record/Capture on the connection detail page
- **THEN** system collects the profile and it appears in the profiles table below without navigation

#### Scenario: View profile from detail page
- **WHEN** user clicks "View" on a profile in the connection detail's profiles table
- **THEN** system navigates to `/profiles/:id` showing the flame graph / call tree viewer

### Requirement: Connection detail status bar
The system SHALL display a status bar at the top of the connection detail showing: target URL, connection status indicator, and context-appropriate actions (Disconnect for active, Reconnect/Remove for saved).

#### Scenario: Disconnect from detail page
- **WHEN** user clicks Disconnect on an active connection's detail page
- **THEN** system disconnects, updates status to saved, hides profiling controls, and shows Reconnect button
