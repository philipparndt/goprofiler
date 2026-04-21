## ADDED Requirements

### Requirement: AI analysis SHALL be available in both Wails and web-server runtimes

The AI analysis features (provider availability check, start analysis, start trace analysis, follow-up analysis, cancel analysis) MUST be reachable from the frontend regardless of whether the app is running as a Wails desktop binary or as a standalone HTTP server. The frontend MUST NOT hide the AI surface solely because the Wails runtime is absent.

#### Scenario: AI panel renders in web mode when provider is available
- **WHEN** the app is running in web-server mode (no Wails runtime), the configured AI provider reports available, and the active target has a source directory set
- **THEN** the AI analysis panel renders and its "Analyze" action is enabled.

#### Scenario: AI panel renders in Wails mode unchanged
- **WHEN** the app is running as Wails and the configured AI provider reports available and a source directory is set
- **THEN** the AI analysis panel renders exactly as before this change (no behavior regression).

#### Scenario: AI panel stays hidden when no provider is available
- **WHEN** no configured AI provider reports available (CLI not installed)
- **THEN** the AI panel is hidden or shows a disabled state with guidance, in both runtimes.

#### Scenario: AI panel disabled when source directory is unset
- **WHEN** the AI provider is available but the active target has no source directory configured
- **THEN** the AI action is disabled with a message prompting the user to set a source directory.

### Requirement: AI operations SHALL be reachable over HTTP in web-server mode

The HTTP API MUST expose endpoints that mirror the Wails AI bindings: provider listing, start analysis, start trace analysis, follow-up, cancel. Requests MUST accept JSON bodies equivalent to the Wails binding request shapes.

#### Scenario: Listing providers over HTTP
- **WHEN** a client issues `GET /api/ai/providers`
- **THEN** the server responds with a JSON array of `{ id, name, available }` objects matching the Wails `GetAvailableAIProviders` shape.

#### Scenario: Starting an analysis over HTTP
- **WHEN** a client issues `POST /api/ai/analyze` with a valid analysis request body
- **THEN** the server responds with `202 Accepted` and a JSON body containing a `streamId` string usable to subscribe to the event stream.

#### Scenario: Following up on an active analysis over HTTP
- **WHEN** a client issues `POST /api/ai/follow-up` with a message for the current analysis
- **THEN** the server responds with `202 Accepted` and a JSON body containing a `streamId` for the follow-up events.

#### Scenario: Canceling the active analysis over HTTP
- **WHEN** a client issues `POST /api/ai/cancel`
- **THEN** the server cancels any in-flight analysis and responds `204 No Content`.

#### Scenario: Missing source directory rejects start
- **WHEN** a client requests analysis for a target that has no source directory set
- **THEN** the server responds with an error (HTTP 4xx) explaining that a source directory is required.

### Requirement: AI events SHALL stream to the browser over Server-Sent Events

Analysis output MUST be delivered to web clients as SSE frames that carry the same event payloads currently emitted via the Wails event bus (`ai:event`, `ai:done`). The stream MUST remain open for the duration of the analysis.

#### Scenario: Client subscribes to an active stream
- **WHEN** a client opens `GET /api/ai/stream/{streamId}` using `EventSource` for an active analysis
- **THEN** the server responds with `Content-Type: text/event-stream` and begins dispatching `ai:event` frames for each event produced by the analysis.

#### Scenario: Stream terminates on completion
- **WHEN** the analysis finishes (success, error, or cancellation)
- **THEN** the server emits a final `ai:done` SSE frame and closes the connection.

#### Scenario: Stream stays alive on idle
- **WHEN** the analysis produces no events for an extended period
- **THEN** the server emits periodic keep-alive comments so proxies do not close the connection.

#### Scenario: Unknown stream ID
- **WHEN** a client subscribes with a stream ID that does not correspond to an active or recently-completed analysis
- **THEN** the server responds with `404 Not Found`.

### Requirement: Source-directory configuration SHALL adapt to the runtime

The source-directory setting for a target MUST be editable in both runtimes. In Wails mode, a native directory-picker button MUST be offered; in web mode, the native button MUST NOT be shown, but a manual path-entry input MUST remain available.

#### Scenario: Wails user picks a directory with the native dialog
- **WHEN** a Wails user clicks the "Browse…" button next to the source-directory input
- **THEN** the native directory picker opens and, on selection, the chosen path is written into the input.

#### Scenario: Web user types a directory path
- **WHEN** a web-mode user enters a source-directory path into the text input and saves
- **THEN** the path is persisted against the target, the input shows the saved value, and the AI action becomes enabled (provided the AI provider is available).

#### Scenario: Web mode omits the native Browse button
- **WHEN** the app runs without the Wails runtime
- **THEN** no "Browse…" button is rendered, and no HTTP endpoint for filesystem browsing is exposed.

### Requirement: A single AI analysis SHALL be active at a time per server

At most one AI analysis (profile or trace, including follow-ups) MUST be running at any time on a given server instance. Starting a new analysis while one is active MUST cancel the prior analysis cleanly.

#### Scenario: Starting a new analysis cancels the previous
- **WHEN** an analysis is in progress and a client starts a new analysis
- **THEN** the previous analysis is canceled, its SSE stream (if any) receives a final `ai:done` frame indicating cancellation, and the new analysis begins.

#### Scenario: Cancel is idempotent
- **WHEN** a client calls cancel with no active analysis
- **THEN** the server responds successfully without error.
