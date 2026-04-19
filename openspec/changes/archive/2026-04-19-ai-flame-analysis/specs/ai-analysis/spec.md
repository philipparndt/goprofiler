## ADDED Requirements

### Requirement: Claude Code availability check
The system SHALL check whether the `claude` CLI is available on the system PATH when the app starts.

#### Scenario: Claude CLI found
- **WHEN** `claude` is found in PATH
- **THEN** AI analysis buttons are enabled

#### Scenario: Claude CLI not found
- **WHEN** `claude` is not found in PATH
- **THEN** AI analysis buttons are disabled with a tooltip explaining that Claude Code must be installed

### Requirement: Explain hot path analysis
The system SHALL provide an "Explain" button in the profile viewer that triggers Claude Code to analyze the top hot functions and explain what the code is doing.

#### Scenario: Trigger explain analysis
- **WHEN** the user clicks "Explain" on a profile with a source directory configured
- **THEN** Claude Code is spawned with a prompt containing the top functions, their stats, and the source directory path, and the results stream into a panel

#### Scenario: No source directory configured
- **WHEN** the user clicks "Explain" but no source directory is set for the target
- **THEN** a message prompts the user to configure a source directory first

### Requirement: Optimize suggestions analysis
The system SHALL provide an "Optimize" button that triggers Claude Code to suggest concrete code improvements for the hot path.

#### Scenario: Trigger optimize analysis
- **WHEN** the user clicks "Optimize" on a profile with a source directory configured
- **THEN** Claude Code is spawned with a prompt requesting optimization suggestions, and results stream into a panel

### Requirement: Streaming results panel
The system SHALL display AI analysis results in a slide-out panel that streams output progressively as Claude Code produces it.

#### Scenario: Results streaming
- **WHEN** Claude Code is producing output
- **THEN** the panel shows a loading indicator and appends text as it arrives

#### Scenario: Cancel analysis
- **WHEN** the user clicks cancel during an ongoing analysis
- **THEN** the Claude Code process is terminated and the panel shows partial results

#### Scenario: Analysis complete
- **WHEN** Claude Code finishes
- **THEN** the loading indicator is removed and the full result is displayed as rendered markdown

### Requirement: Analysis scoped to zoomed view
The system SHALL scope the AI analysis to the currently zoomed flame graph subtree when zoomed in.

#### Scenario: Zoomed analysis
- **WHEN** the user has zoomed into a flame graph subtree and clicks "Explain"
- **THEN** the analysis focuses on functions within that subtree rather than the full profile
