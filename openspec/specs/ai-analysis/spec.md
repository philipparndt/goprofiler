# ai-analysis Specification

## Purpose
TBD - created by archiving change ai-available-in-web. Update Purpose after archive.
## Requirements
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

### Requirement: Follow-up turns SHALL reuse a live provider process for the Claude provider

For the `claude` provider, a follow-up message during an active analysis MUST be delivered to the same underlying CLI process that handled the previous turn, without spawning a new process. This eliminates CLI boot latency on subsequent turns within one analysis session.

#### Scenario: Follow-up is routed to the existing session
- **WHEN** an analysis is in progress against the Claude provider and the user (or the panel) sends a follow-up message
- **THEN** the system writes the new user message to the existing CLI process's standard input in stream-json format and does not spawn a new process.

#### Scenario: Events continue to stream after a follow-up
- **WHEN** a follow-up message has been sent to the existing process
- **THEN** the analysis event channel continues to emit `ai:event` frames produced by that same process.

#### Scenario: GitHub Copilot provider is unchanged
- **WHEN** the active provider is `gh-copilot`
- **THEN** each analysis turn spawns a fresh CLI invocation as before (Copilot has no persistent session concept).

### Requirement: Starting a new analysis SHALL terminate any prior session

Starting a new analysis (including a new trace analysis) MUST close the prior CLI session, if any, before spawning or reusing a process for the new run. This preserves the single-active-analysis semantic while keeping the fast-follow-up behavior.

#### Scenario: New start cancels previous session
- **WHEN** an analysis is already running and a new `start analysis` or `start trace analysis` request arrives
- **THEN** the existing session is closed, its event stream is terminated with an `ai:done` frame, and a fresh CLI process is spawned for the new run.

#### Scenario: Cancel terminates the session
- **WHEN** the user cancels the active analysis
- **THEN** the CLI session is closed and its event stream is terminated; a subsequent follow-up without first starting a new analysis MUST fail with a clear "no active session" error.

### Requirement: The persistent session SHALL surface CLI failures as stream errors

If the CLI process exits unexpectedly or fails to start, the system MUST emit an error event on the analysis stream so the panel can display the failure rather than hanging.

#### Scenario: CLI crashes mid-response
- **WHEN** the CLI process exits with a non-zero status while a turn is in progress
- **THEN** the event stream emits an `ai:event` with a populated `error` field describing the failure, followed by `ai:done`, and the session is marked closed.

#### Scenario: CLI cannot start (unsupported version)
- **WHEN** the CLI does not support the streaming input mode (e.g. an older Claude Code version)
- **THEN** the system either falls back to the per-turn spawn path or returns a start error; in either case the user's first analysis produces a visible, actionable outcome.

### Requirement: Changing source directory or permission level MUST invalidate the persistent session

A persistent CLI process is rooted in one working directory and one permission mode. If the user's next request targets a different source directory or permission level, the existing session MUST be closed and a new one spawned for the new parameters.

#### Scenario: Source directory changed between turns
- **WHEN** a follow-up request's resolved source directory differs from the active session's working directory
- **THEN** the active session is closed and a new process is spawned in the new directory before the message is sent.

#### Scenario: Permission level changed between turns
- **WHEN** a follow-up request's permission level differs from the one the active session was spawned with
- **THEN** the active session is closed and a new process is spawned with the new permission mode before the message is sent.

