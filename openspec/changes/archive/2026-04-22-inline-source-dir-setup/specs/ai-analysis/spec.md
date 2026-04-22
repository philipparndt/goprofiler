## ADDED Requirements

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
