## ADDED Requirements

### Requirement: Explain goroutine via click
The trace viewer SHALL allow the user to trigger AI analysis for a specific goroutine.

#### Scenario: Explain from goroutines table
- **WHEN** the user right-clicks a goroutine row in the Goroutines tab
- **THEN** a context menu with "Explain this goroutine" appears; selecting it triggers AI analysis focused on that goroutine's state transitions, blocking reasons, and stack traces

#### Scenario: Explain from selected goroutine in timeline
- **WHEN** the user has selected a goroutine in the timeline (via clicking a span) and an "Explain" button is visible in the span detail panel
- **THEN** clicking it triggers AI analysis for that goroutine

### Requirement: Explain blocking entry
The trace viewer SHALL allow the user to trigger AI analysis for a specific blocking entry.

#### Scenario: Explain from blocking tab
- **WHEN** the user clicks an "Explain" button next to a blocking entry in the Blocking tab
- **THEN** AI analysis is triggered with the blocking location, category, duration, count, and stack trace, explaining the root cause and suggesting fixes

### Requirement: Explain timeline span via context menu
The timeline SHALL support right-click context menu on goroutine spans for AI explanation.

#### Scenario: Right-click span in timeline
- **WHEN** the user right-clicks a span in the timeline
- **THEN** a context menu appears with "Explain this span" that triggers AI analysis covering: what state the goroutine is in, why, what the stack trace indicates, and what the blocking reason means

### Requirement: Contextual prompts include trace data
All trace AI prompts SHALL include relevant trace data structured for the AI to reason about.

#### Scenario: Goroutine prompt includes state history
- **WHEN** AI analysis is triggered for a goroutine
- **THEN** the prompt includes the goroutine's name, all state transitions with timestamps and durations, blocking reasons, and stack traces

#### Scenario: Blocking prompt includes category context
- **WHEN** AI analysis is triggered for a blocking entry
- **THEN** the prompt includes the blocking location, category description, total duration, count, stack trace, and the broader blocking summary for comparison

#### Scenario: Span prompt includes surrounding context
- **WHEN** AI analysis is triggered for a timeline span
- **THEN** the prompt includes the goroutine name, the span's state/duration/reason/stack, and adjacent spans for context
