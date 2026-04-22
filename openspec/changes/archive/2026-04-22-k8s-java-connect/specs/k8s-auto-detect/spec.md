## ADDED Requirements

### Requirement: Detect pod language from container spec
The system SHALL analyze a pod's container specification to detect whether it runs a Go or Java application.

#### Scenario: Java detection via image
- **WHEN** a pod's container image name contains "java", "jdk", "openjdk", "spring", "quarkus", or "maven"
- **THEN** the pod is marked as Java

#### Scenario: Java detection via env vars
- **WHEN** a pod's container has `JAVA_TOOL_OPTIONS`, `JAVA_OPTS`, or `JMX_PORT` environment variables
- **THEN** the pod is marked as Java

#### Scenario: Go detection via port
- **WHEN** a pod's container exposes port 6060 or a port named "pprof" or "debug"
- **THEN** the pod is marked as Go

#### Scenario: Unknown language
- **WHEN** the heuristics cannot determine the language
- **THEN** the pod is shown as "Unknown" and the user selects the language manually during connection

### Requirement: Detect profiling ports from container spec
The system SHALL detect which ports to forward for profiling based on the container specification.

#### Scenario: JMX port detection
- **WHEN** a Java pod has port 9999 or 1099 exposed, or `com.sun.management.jmxremote.port` in env vars
- **THEN** that port is pre-selected for port-forwarding

#### Scenario: pprof port detection
- **WHEN** a Go pod has port 6060 exposed or a port named "pprof"
- **THEN** that port is pre-selected

#### Scenario: Manual port specification
- **WHEN** no profiling port is auto-detected
- **THEN** the user can manually enter the port number before connecting
