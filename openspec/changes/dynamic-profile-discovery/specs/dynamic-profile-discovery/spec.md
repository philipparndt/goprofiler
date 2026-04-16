## ADDED Requirements

### Requirement: Discover available profiles from target index
The system SHALL fetch the `/debug/pprof/` index page of a connected target and parse it to determine which profile types are available.

#### Scenario: Target exposes pprof index with standard profiles
- **WHEN** the backend fetches `/debug/pprof/` from a connected target
- **THEN** the response includes at minimum cpu, heap, goroutine, block, and mutex entries
- **AND** each entry includes a name and an item count (null for cpu)

#### Scenario: Target exposes custom registered profiles
- **WHEN** the target has called `pprof.NewProfile("myapp", 0)` and the backend fetches the index
- **THEN** the discovery result includes an entry with name `myapp` and kind `snapshot`

#### Scenario: Target does not expose pprof index
- **WHEN** the GET request to `/debug/pprof/` returns a non-200 status or a network error
- **THEN** the system returns a discovery error and the frontend falls back to the hardcoded profile list
- **AND** the frontend shows a warning indicator on the type selector

### Requirement: Cache discovered profiles per connection
The system SHALL cache the discovery result for each connection and reuse it for subsequent requests within the same session.

#### Scenario: First request for a connection
- **WHEN** the available profiles endpoint is called for a connection with no cached result
- **THEN** the system fetches and parses the target's pprof index and stores the result in the cache

#### Scenario: Subsequent request for the same connection
- **WHEN** the available profiles endpoint is called for a connection that already has a cached result
- **THEN** the system returns the cached result without making an outbound HTTP request to the target

#### Scenario: Cache invalidation on connection removal
- **WHEN** a connection is removed
- **THEN** its cached discovery result is evicted

### Requirement: Expose available profiles via API endpoint
The system SHALL provide a `GET /targets/{id}/profiles/available` endpoint that returns the discovered profile list for the given connection.

#### Scenario: Successful discovery
- **WHEN** a valid target ID is provided and discovery succeeds
- **THEN** the endpoint returns HTTP 200 with a JSON array of objects each containing `name`, `count`, and `kind` fields

#### Scenario: Unknown target ID
- **WHEN** the target ID does not correspond to a known connection
- **THEN** the endpoint returns HTTP 404

#### Scenario: Discovery fetch failure
- **WHEN** the outbound request to the target fails
- **THEN** the endpoint returns HTTP 502 with an error message

### Requirement: Frontend uses discovered types for profile type selector
The system SHALL populate the profile type selector on the Connections page and the New Profile dialog using the list returned by the discovery endpoint, rather than a hardcoded list.

#### Scenario: Discovery succeeds with standard types only
- **WHEN** the discovery endpoint returns only the five standard types
- **THEN** the type selector shows the same Record / Snapshot grouping as before with no Custom group

#### Scenario: Discovery succeeds with custom types present
- **WHEN** the discovery endpoint returns one or more names not in the well-known set
- **THEN** the type selector shows a third "Custom" group containing those types

#### Scenario: Discovery is loading
- **WHEN** the frontend has sent the discovery request but not yet received a response
- **THEN** the type selector shows a loading indicator in place of the type buttons

#### Scenario: Discovery fails
- **WHEN** the discovery endpoint returns an error
- **THEN** the type selector falls back to the hardcoded list of five standard types
- **AND** a warning indicator is shown near the type selector

### Requirement: Manual refresh of available profiles
The system SHALL provide a way for the user to trigger a fresh discovery request for the current target.

#### Scenario: User clicks Refresh
- **WHEN** the user activates the refresh control on the type selector
- **THEN** the system evicts the cached result for that connection and re-fetches from the target
- **AND** the type selector updates to reflect the new result
