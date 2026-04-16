## MODIFIED Requirements

### Requirement: Application shell with sidebar navigation
The system SHALL provide a dark-themed application shell with a sidebar for navigation between views: Dashboard, Connections, and Setup. The standalone Profiles link SHALL be removed from the sidebar.

#### Scenario: Navigate between views
- **WHEN** user clicks a navigation item in the sidebar
- **THEN** system displays the corresponding view without a full page reload

### Requirement: Dashboard view
The system SHALL display a dashboard as the landing page showing: active connections with status and profile count, recent profiles across all connections, and quick-action links to connection details.

#### Scenario: Dashboard with active connections
- **WHEN** user opens the application with connected targets
- **THEN** dashboard shows connection cards linking to their detail pages, plus a recent profiles section

#### Scenario: Empty dashboard
- **WHEN** user opens the application with no connections
- **THEN** dashboard shows a welcome message with instructions to connect to a target
