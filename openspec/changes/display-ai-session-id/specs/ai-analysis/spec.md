## ADDED Requirements

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
