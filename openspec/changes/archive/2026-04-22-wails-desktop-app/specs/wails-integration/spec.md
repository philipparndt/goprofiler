## ADDED Requirements

### Requirement: Desktop app entry point
The system SHALL provide a Wails v2 desktop entry point at `cmd/desktop/` that launches GoProfiler in a native window with the same React frontend.

#### Scenario: Launch desktop app
- **WHEN** the user runs the desktop binary
- **THEN** a native window opens displaying the GoProfiler UI

#### Scenario: Desktop app initializes services
- **WHEN** the desktop app starts
- **THEN** it SHALL initialize the same storage, connection, and monitor services as the web mode using the same default data directory (`~/.goprofiler`)

### Requirement: Wails bindings expose backend API
The system SHALL expose Go bindings via Wails that provide the same functionality as the HTTP REST API. The bindings SHALL call the same internal service packages used by the HTTP handlers.

#### Scenario: Connection management via bindings
- **WHEN** the frontend calls a Wails binding to list, add, or remove connections
- **THEN** the binding SHALL delegate to `connection.Store` and return the same data structures as the REST API

#### Scenario: Profile operations via bindings
- **WHEN** the frontend calls a Wails binding to list profiles, capture a snapshot, or retrieve flamegraph data
- **THEN** the binding SHALL delegate to the existing profiler/storage/flamegraph packages

#### Scenario: Monitor data via bindings
- **WHEN** the frontend calls a Wails binding to get memory or goroutine data
- **THEN** the binding SHALL delegate to `monitor.Service` and return the same data points

### Requirement: Dual-mode frontend API layer
The frontend API layer (`api.ts`) SHALL detect whether it is running inside Wails or a browser and route calls accordingly.

#### Scenario: Browser mode detection
- **WHEN** the frontend loads in a regular browser (no Wails runtime)
- **THEN** all API calls SHALL use `fetch("/api/...")` as before

#### Scenario: Wails mode detection
- **WHEN** the frontend loads inside the Wails webview
- **THEN** all API calls SHALL use Wails runtime bindings instead of HTTP fetch

#### Scenario: API parity between modes
- **WHEN** the same user action is performed in browser mode and desktop mode
- **THEN** the returned data SHALL be identical in structure

### Requirement: Web mode remains unchanged
The existing web server entry point (`cmd/goprofiler/`) SHALL continue to work identically. No changes to its behavior, flags, or API.

#### Scenario: Web mode unaffected
- **WHEN** the user runs the web binary with existing flags
- **THEN** behavior SHALL be identical to before this change

### Requirement: Desktop build targets
The build system SHALL provide Makefile targets for building and developing the desktop app.

#### Scenario: Build desktop app
- **WHEN** the user runs `make build-desktop`
- **THEN** a native desktop binary SHALL be produced for the current platform

#### Scenario: Desktop dev mode
- **WHEN** the user runs `make dev-desktop`
- **THEN** the Wails dev server SHALL start with hot-reload for both frontend and backend changes
