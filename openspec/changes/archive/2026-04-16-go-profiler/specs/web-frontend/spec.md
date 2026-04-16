## ADDED Requirements

### Requirement: Application shell with sidebar navigation
The system SHALL provide a dark-themed application shell with a sidebar for navigation between views: Dashboard, Connections, Profiles, and Settings.

#### Scenario: Navigate between views
- **WHEN** user clicks a navigation item in the sidebar
- **THEN** system displays the corresponding view without a full page reload

#### Scenario: Responsive layout
- **WHEN** the browser window is resized
- **THEN** the layout adapts, with the sidebar collapsible on smaller screens

### Requirement: Dashboard view
The system SHALL display a dashboard as the landing page showing: active connections with status, recent profiles, and quick-action buttons to start profiling.

#### Scenario: Dashboard with active connections
- **WHEN** user opens the application with connected targets
- **THEN** dashboard shows connection cards with health status, target URL, and a "Profile" button for each

#### Scenario: Empty dashboard
- **WHEN** user opens the application with no connections
- **THEN** dashboard shows a welcome message with instructions to connect to a target

### Requirement: Connection management panel
The system SHALL provide a connection panel where users can add, view, and manage pprof target connections.

#### Scenario: Add new connection
- **WHEN** user clicks "Add Connection" and enters a pprof URL
- **THEN** system attempts to connect and adds the target to the connections list

### Requirement: Profiling controls
The system SHALL provide intuitive controls for starting, stopping, and configuring profiling sessions on connected targets.

#### Scenario: Start profiling from target card
- **WHEN** user clicks "Profile" on a connected target card
- **THEN** system shows a panel with profile type selection (CPU, Heap, Goroutine, Block, Mutex), duration configuration, and a "Start" button

#### Scenario: View active profiling progress
- **WHEN** a CPU profiling session is active
- **THEN** system displays a progress bar with elapsed/remaining time and a "Stop" button

### Requirement: Profile viewer with flame graph
The system SHALL display collected profiles in a dedicated viewer with the flame graph as the primary visualization, along with a top-functions table.

#### Scenario: Open profile in viewer
- **WHEN** user clicks on a profile in the profiles list
- **THEN** system opens the profile viewer showing the flame graph, a summary panel (total samples, duration, type), and a top-functions table sorted by cumulative time

### Requirement: Top functions table
The system SHALL display a sortable table of functions alongside the flame graph, showing flat time, cumulative time, and call counts.

#### Scenario: Sort by flat time
- **WHEN** user clicks the "Flat" column header in the top functions table
- **THEN** system sorts functions by self/flat time descending

#### Scenario: Click function in table
- **WHEN** user clicks a function name in the top functions table
- **THEN** system zooms the flame graph to that function's frame

### Requirement: Setup instructions page
The system SHALL include a help/setup page with instructions for enabling pprof in Go applications, including code snippets and common configurations.

#### Scenario: View setup instructions
- **WHEN** user navigates to the Setup/Help page
- **THEN** system displays step-by-step instructions with copyable code snippets for adding `import _ "net/http/pprof"` and exposing the pprof endpoint

### Requirement: Dark theme
The system SHALL use a dark color theme as the default and only theme, designed for extended developer use with high contrast and reduced eye strain.

#### Scenario: Application renders in dark theme
- **WHEN** user opens the application
- **THEN** all UI elements render with a dark background, light text, and accent colors for interactive elements
