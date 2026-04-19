## ADDED Requirements

### Requirement: Trace overview AI analysis
The trace viewer SHALL provide an "Analyze Trace" button that triggers a high-level AI analysis of the entire trace.

#### Scenario: Analyze full trace
- **WHEN** the user clicks "Analyze Trace" in the trace viewer header
- **THEN** the AI panel opens and shows a streaming analysis covering: what the trace captures, key goroutine patterns, blocking hotspots, GC impact, and overall assessment

#### Scenario: Overview includes key metrics
- **WHEN** the trace overview analysis is generated
- **THEN** it includes: trace duration, goroutine count, top blocked goroutines, dominant blocking categories, GC pause impact, and any anomalies detected

#### Scenario: Overview references source code
- **WHEN** a source directory is configured for the target
- **THEN** the AI reads relevant source files (referenced by stack traces in the trace) to provide code-level explanations

### Requirement: Per-tab AI analysis buttons
Each trace viewer tab SHALL provide a focused AI analysis button that analyzes the data relevant to that tab.

#### Scenario: Goroutines tab analysis
- **WHEN** the user clicks the AI button on the Goroutines tab
- **THEN** the analysis focuses on goroutine state patterns, which goroutines are most blocked, and what they're waiting for

#### Scenario: Blocking tab analysis
- **WHEN** the user clicks the AI button on the Blocking tab
- **THEN** the analysis focuses on contention patterns, explaining each blocking category and suggesting mitigations

#### Scenario: GC tab analysis
- **WHEN** the user clicks the AI button on the GC tab
- **THEN** the analysis focuses on GC frequency, pause distribution, whether GC is a bottleneck, and what drives allocation pressure

### Requirement: AI buttons only in desktop mode
AI analysis buttons SHALL only be visible in the Wails desktop app when an AI provider is available.

#### Scenario: Web mode hides AI buttons
- **WHEN** the trace viewer is loaded in the web app
- **THEN** no AI analysis buttons are shown

#### Scenario: No AI provider disables buttons
- **WHEN** no AI CLI is available on the system
- **THEN** AI buttons are disabled with an explanatory tooltip
