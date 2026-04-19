## ADDED Requirements

### Requirement: Java heap monitoring chart
The system SHALL display a real-time JVM heap usage chart for Java targets, equivalent to Go's memory chart.

#### Scenario: Heap chart displays
- **WHEN** the user opens the Monitor tab for a connected Java target
- **THEN** a heap chart shows used heap, committed heap, and max heap over time

### Requirement: Java CPU monitoring chart
The system SHALL display a real-time JVM CPU usage chart for Java targets.

#### Scenario: CPU chart displays
- **WHEN** the user opens the Monitor tab for a Java target
- **THEN** a CPU chart shows process CPU usage percentage over time (from JMX OperatingSystem MBean)

### Requirement: Java thread count monitoring
The system SHALL display a real-time thread count chart for Java targets, equivalent to Go's goroutine chart.

#### Scenario: Thread count chart
- **WHEN** the user opens the Monitor tab for a Java target
- **THEN** a chart shows current thread count and peak thread count over time

### Requirement: Java GC monitoring
The system SHALL display real-time GC statistics for Java targets.

#### Scenario: GC stats in monitor
- **WHEN** the user opens the Monitor tab for a Java target
- **THEN** GC collection count, time, and pause information is displayed and updated in real-time
