## ADDED Requirements

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
