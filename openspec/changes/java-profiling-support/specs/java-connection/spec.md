## ADDED Requirements

### Requirement: Connect to Java application via JMX
The system SHALL allow users to connect to a Java application by providing a JMX connection URL or host:port.

#### Scenario: Connect with JMX URL
- **WHEN** the user enters a JMX URL (e.g., `localhost:9999` or `service:jmx:rmi:///...`)
- **THEN** the system connects via JMX, validates the connection, and adds the target with language "java"

#### Scenario: JMX connection health check
- **WHEN** a Java target is connected
- **THEN** the system periodically validates the JMX connection and updates the target status

#### Scenario: Connection failure
- **WHEN** the JMX connection cannot be established
- **THEN** the system shows an appropriate error message

### Requirement: Connect to Java application via async-profiler HTTP agent
The system SHALL allow connecting to Java applications running the async-profiler HTTP agent.

#### Scenario: Connect with async-profiler URL
- **WHEN** the user enters an HTTP URL for an async-profiler agent endpoint
- **THEN** the system connects, validates, and adds the target with language "java" and profiling method "async-profiler"

### Requirement: Java connection configuration
The system SHALL provide Java-specific connection options.

#### Scenario: Connection dialog shows Java option
- **WHEN** the user opens the connect dialog
- **THEN** they can choose between "Go (pprof)" and "Java (JMX)" connection types
