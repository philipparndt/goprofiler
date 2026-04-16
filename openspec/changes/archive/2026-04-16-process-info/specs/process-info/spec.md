## ADDED Requirements

### Requirement: Process info endpoint
The system SHALL provide `GET /api/targets/{id}/process-info` that fetches command line arguments from the target's `/debug/pprof/cmdline` and parses Go version, GOOS, and GOARCH from the target's `/debug/pprof/heap?debug=1` response.

#### Scenario: Successful fetch
- **WHEN** the frontend requests process info for a connected target
- **THEN** the system returns a JSON object with `cmdline` (array of strings), `goVersion`, `goos`, and `goarch` fields populated from the live target

#### Scenario: Target does not expose cmdline
- **WHEN** the target's `/debug/pprof/cmdline` returns an error or empty response
- **THEN** the system returns a response with `cmdline` as an empty array and still attempts to populate build info fields

#### Scenario: Build info not parseable
- **WHEN** the heap debug output does not contain recognizable build info header lines
- **THEN** the system returns a response with `goVersion`, `goos`, and `goarch` as empty strings; no error is returned to the frontend

#### Scenario: Target not connected
- **WHEN** the frontend requests process info for a target that is not in the connected state
- **THEN** the system returns HTTP 404 or 400 with an appropriate error message

### Requirement: Process info displayed in connection detail header
The system SHALL display target process information in the connection detail status bar when the target is connected and process info is available.

#### Scenario: Connected target with process info
- **WHEN** a user opens the connection detail page for a connected target
- **THEN** the status bar shows the executable name (derived from the first cmdline argument), Go version, and OS/architecture as a compact secondary line beneath the URL and status badge

#### Scenario: Full command line accessible
- **WHEN** the target was launched with additional arguments beyond the binary name
- **THEN** the truncated argument string is visible in the UI and the full command line is accessible via a tooltip or title attribute on the element

#### Scenario: Process info unavailable
- **WHEN** the process info fetch fails or returns empty data
- **THEN** the connection detail page loads normally with no process info section shown; no error message is displayed to the user

#### Scenario: Saved (disconnected) target
- **WHEN** a user opens the connection detail page for a saved target that is not currently connected
- **THEN** no process info fetch is attempted and no process info section is shown
