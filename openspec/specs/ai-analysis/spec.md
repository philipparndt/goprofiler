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

### Requirement: The AI analysis panel SHALL support collapsing without stopping the analysis

The panel MUST expose a user control that switches it from an expanded view to a compact collapsed view. Collapsing MUST NOT cancel the active analysis or drop the event subscription — the run continues in the background and any events produced while collapsed MUST still update the panel's internal state.

#### Scenario: Collapsing during an active run
- **WHEN** an analysis is producing events and the user activates the collapse control
- **THEN** the panel renders its compact collapsed view
- **AND** the underlying analysis process continues to run
- **AND** events received while collapsed continue to update the panel's content, activity, and session-ID state.

#### Scenario: Re-expanding shows current state
- **WHEN** the user activates the expand control while events have been received in the background
- **THEN** the panel renders its expanded view with the current accumulated content, the latest activity line, and the latest session ID
- **AND** the panel remains on the same analysis (no new run is started).

#### Scenario: Collapse is distinct from Cancel and Close
- **WHEN** the user collapses the panel
- **THEN** neither the analysis is cancelled nor the panel's state is cleared
- **AND** the existing Cancel control still stops the current turn without hiding the panel
- **AND** the existing Close control still cancels the analysis and removes the panel.

### Requirement: The collapsed view SHALL communicate analysis status at a glance

The collapsed view MUST show whether the analysis is running, has finished, or has errored, using a visual indicator that differentiates these three states without requiring the panel to be expanded.

#### Scenario: Running state
- **WHEN** the panel is collapsed and the analysis is still receiving events
- **THEN** the collapsed view shows a live/pulsing indicator and a "running" status label.

#### Scenario: Ready state
- **WHEN** the panel is collapsed and the analysis has produced its final result
- **THEN** the collapsed view shows an idle indicator and a "ready" status label.

#### Scenario: Error state
- **WHEN** the panel is collapsed and the analysis has emitted an error
- **THEN** the collapsed view shows an error-styled indicator and an "error" status label.

### Requirement: The collapsed view SHALL signal background completion or error

If the analysis completes or errors while the panel is collapsed, the collapsed view MUST show an unread-style indicator so the user knows something happened. Expanding the panel MUST clear the indicator.

#### Scenario: Run completes while collapsed
- **WHEN** the panel is collapsed while the run is active and the run subsequently finishes
- **THEN** the collapsed view additionally shows an unread marker alongside the status indicator.

#### Scenario: Expanding clears the unread marker
- **WHEN** the user expands the panel after a background completion
- **THEN** the unread marker is removed on the next render.

### Requirement: The collapsed view SHALL be operable by keyboard

The collapsed view MUST be focusable and activatable via keyboard with a descriptive accessible label so users can expand the panel without a mouse.

#### Scenario: Expand via keyboard
- **WHEN** the collapsed view has keyboard focus and the user activates it (Enter or Space)
- **THEN** the panel expands.

#### Scenario: Accessible label reflects state
- **WHEN** the collapsed view is focused by a screen reader
- **THEN** the announced label reflects the current status (running / ready / error).

### Requirement: The AI panel SHALL offer in-panel source-directory setup when the analysis cannot start

When an analysis start fails because the active target has no source directory configured, the analysis panel MUST render a form that lets the user enter the source directory directly, rather than only displaying a textual instruction to navigate elsewhere.

#### Scenario: Missing source dir surfaces the inline form
- **WHEN** the user triggers an analysis on a target whose source directory is not configured
- **THEN** the AI panel opens and renders a form containing a source-directory text input, a "Save & Start" action, and — in Wails mode — a native "Browse…" button.

#### Scenario: Form supplies help text in web mode
- **WHEN** the panel renders the source-directory form and the app is running in web/browser mode (no native dialog available)
- **THEN** the form includes short help text explaining that the path is on the server's filesystem, with an example path.

#### Scenario: Unrelated analysis errors are unchanged
- **WHEN** the analysis fails for any reason other than a missing source directory
- **THEN** the panel renders its usual error view without the source-directory form.

### Requirement: Saving the directory SHALL retry the original analysis request automatically

After the user submits the form, the panel MUST persist the directory via the existing setSourceDir API and then retry the exact analysis request that previously failed — same mode, same payload — without any additional user interaction.

#### Scenario: Successful save and retry
- **WHEN** the user enters a path and activates "Save & Start"
- **THEN** the panel calls setSourceDir for the target
- **AND** on success it clears any save-time error
- **AND** it re-runs the previously-failed analysis so the panel transitions into its normal "loading" state.

#### Scenario: Save fails
- **WHEN** the setSourceDir call rejects (network, backend validation, etc.)
- **THEN** the panel shows the save error near the input
- **AND** the previously-failed analysis is NOT retried
- **AND** the form remains visible so the user can correct the path.

#### Scenario: Disabled until non-empty
- **WHEN** the source-directory input is empty
- **THEN** the "Save & Start" action is disabled.

### Requirement: The panel SHALL fall back to the prior instruction text when retry cannot be wired

If the panel is used in a context where the caller has not supplied a target ID or a retry callback, the source-directory form MUST NOT be rendered; the existing textual instruction MUST be rendered instead. This preserves backward compatibility for any caller that hasn't been updated.

#### Scenario: Caller didn't supply target ID
- **WHEN** the panel receives a "no source directory" error but no target ID is provided
- **THEN** the panel renders the original textual instruction and no form.

#### Scenario: Caller didn't supply a retry callback
- **WHEN** the panel receives a "no source directory" error but no retry callback is provided
- **THEN** the panel renders the original textual instruction and no form.

### Requirement: The AI analysis panel SHALL display the current provider session identifier

When the AI provider emits a session identifier (via the `sessionId` field on streamed events), the analysis panel MUST surface that identifier in its header so the user can read it and copy it. Providers that do not emit a session identifier MUST NOT cause any placeholder or error UI — the slot simply stays empty.

#### Scenario: Session ID appears after the first event
- **WHEN** an analysis is running and the first event with a non-empty `sessionId` arrives
- **THEN** the panel header displays the session identifier in a truncated form with a tooltip revealing the full value.

#### Scenario: Session ID updates as the provider revises it
- **WHEN** a subsequent event arrives with a different, non-empty `sessionId`
- **THEN** the displayed identifier updates to match the most recent value.

#### Scenario: Provider does not emit a session ID
- **WHEN** the active provider never emits a session identifier (for example, GitHub Copilot)
- **THEN** the panel header renders normally with no session-ID chip and no error.

#### Scenario: Panel is opened for a new analysis
- **WHEN** the panel is opened for a fresh analysis (it was previously closed or a new run has started)
- **THEN** any prior session identifier is cleared before events begin arriving.

### Requirement: The displayed session identifier SHALL be copyable in one click

The panel MUST provide a control that copies the full session identifier to the system clipboard. The control MUST give the user transient visual confirmation that the copy succeeded.

#### Scenario: Copying a session ID
- **WHEN** the user clicks the copy control next to the session ID
- **THEN** the full identifier is written to the clipboard
- **AND** the control briefly indicates success (e.g. a "Copied" label for about 1.5 s) before reverting.

#### Scenario: Clipboard access is denied
- **WHEN** the browser denies clipboard access or the write throws
- **THEN** the control briefly indicates failure (e.g. "Copy failed") and the panel remains operational.

### Requirement: The panel SHALL provide a provider-appropriate resume hint

When the active provider supports resuming a session by identifier (e.g. `claude --resume <id>`), the panel MUST show the exact command form so the user can take over in a terminal. For providers without a resume concept, the hint MUST be omitted.

#### Scenario: Claude provider shows the resume command
- **WHEN** the session ID is displayed and the active provider is `claude`
- **THEN** the panel renders a helper that shows the command `claude --resume <id>` with the full ID accessible (via tooltip or expanded form).

#### Scenario: Non-resumable provider omits the hint
- **WHEN** the active provider is not known to support session resumption
- **THEN** the panel omits the resume helper but still shows the raw session identifier.

