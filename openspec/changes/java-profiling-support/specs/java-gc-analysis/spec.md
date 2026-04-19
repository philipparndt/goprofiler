## ADDED Requirements

### Requirement: JFR GC event analysis
The system SHALL provide GC analysis from JFR recordings, equivalent to Go's trace GC tab.

#### Scenario: GC analysis from JFR
- **WHEN** a JFR recording is loaded with GC events
- **THEN** the GC tab shows: event count, total pause time, average pause, max pause, pause distribution, and per-event details

#### Scenario: GC collector information
- **WHEN** analyzing GC events from a JFR recording
- **THEN** the analysis shows which GC collector was used (G1, ZGC, Shenandoah, etc.) and collector-specific metrics

### Requirement: GC AI analysis for Java
The system SHALL support AI-powered GC analysis for Java applications.

#### Scenario: AI explains Java GC
- **WHEN** the user clicks "Analyze GC" on a Java target's GC tab
- **THEN** the AI explains the GC behavior in Java context (collector type, heap sizing, promotion rates, etc.)
