# language-abstraction Specification

## Purpose
TBD - created by archiving change java-profiling-support. Update Purpose after archive.
## Requirements
### Requirement: Language field on targets
Each target SHALL have a `language` field indicating whether it is a Go or Java application.

#### Scenario: Go target detection
- **WHEN** a target is connected and responds to `/debug/pprof/`
- **THEN** the language is set to "go"

#### Scenario: Java target via JMX
- **WHEN** a user adds a target with a JMX connection string or the target is identified as Java
- **THEN** the language is set to "java"

#### Scenario: Language displayed in UI
- **WHEN** a target is shown in the sidebar or connection list
- **THEN** a language badge ("Go" or "Java") is displayed next to the target name

### Requirement: Language-adaptive views
The frontend SHALL adapt labels and available features based on the target's language.

#### Scenario: Go target views
- **WHEN** viewing a Go target's profiles and monitoring
- **THEN** views use Go terminology (goroutines, memstats, pprof)

#### Scenario: Java target views
- **WHEN** viewing a Java target's profiles and monitoring
- **THEN** views use Java terminology (threads, JVM heap, JFR) and show Java-specific tabs (JFR Events)

