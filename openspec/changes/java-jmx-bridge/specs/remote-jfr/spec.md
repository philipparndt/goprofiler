## ADDED Requirements

### Requirement: Remote JFR recording via JMX
The system SHALL support starting/stopping JFR recordings on remote JVMs via the FlightRecorderMXBean.

#### Scenario: Start remote JFR recording
- **WHEN** the user starts a CPU/alloc/lock profile on a remote Java target
- **THEN** the system uses the JMX bridge to start a JFR recording via FlightRecorderMXBean

#### Scenario: Stop and collect remote JFR
- **WHEN** the recording duration completes or the user stops it
- **THEN** the bridge dumps the recording to a temp file and the system reads it

#### Scenario: JFR on K8s targets
- **WHEN** a Java pod is connected via K8s port-forward with JMX
- **THEN** JFR recordings can be started/stopped via the forwarded JMX connection
