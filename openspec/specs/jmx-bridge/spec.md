# jmx-bridge Specification

## Purpose
TBD - created by archiving change java-jmx-bridge. Update Purpose after archive.
## Requirements
### Requirement: JMX Bridge Java tool
The system SHALL include a bundled Java CLI tool that connects to JVMs via JMX and outputs structured JSON.

#### Scenario: Monitor command
- **WHEN** the bridge is invoked with `<jmxUrl> monitor`
- **THEN** it connects via JMX and streams one JSON object per second to stdout containing all platform MBean data

#### Scenario: Thread dump command
- **WHEN** the bridge is invoked with `<jmxUrl> threads`
- **THEN** it outputs a JSON array of all threads with state, stack trace, lock info, and deadlock detection

#### Scenario: Connection failure
- **WHEN** the bridge cannot connect to the JMX URL
- **THEN** it outputs a JSON error object and exits with non-zero code

#### Scenario: JMX URL formats
- **WHEN** the bridge is given `host:port` or `service:jmx:rmi:///...`
- **THEN** it connects using the appropriate JMX connector

### Requirement: Bridge process lifecycle
The Go backend SHALL manage the bridge process lifecycle.

#### Scenario: Start on target connect
- **WHEN** a Java target is connected and monitoring starts
- **THEN** the bridge process is spawned and monitored

#### Scenario: Stop on target disconnect
- **WHEN** a Java target is disconnected
- **THEN** the bridge process is killed

#### Scenario: Auto-restart on crash
- **WHEN** the bridge process exits unexpectedly
- **THEN** it is restarted after a brief delay

