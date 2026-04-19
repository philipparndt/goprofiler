## ADDED Requirements

### Requirement: Per-pool memory monitoring
The system SHALL display memory usage broken down by JVM memory pool.

#### Scenario: Memory pools chart
- **WHEN** viewing the Monitor tab for a Java target
- **THEN** the heap chart shows individual pools (Eden, Survivor, Old Gen) and non-heap pools (Metaspace, Code Cache)

### Requirement: Per-collector GC monitoring
The system SHALL display GC statistics per garbage collector.

#### Scenario: GC stats per collector
- **WHEN** viewing the Monitor tab for a Java target
- **THEN** GC stats show young GC (count, time) and old GC (count, time) separately

### Requirement: Enhanced thread monitoring
The system SHALL display detailed thread information including daemon count and peak.

#### Scenario: Thread details
- **WHEN** viewing the Monitor tab for a Java target
- **THEN** thread count, daemon count, and peak thread count are shown

### Requirement: CPU monitoring from MBeans
The system SHALL display process and system CPU usage from OperatingSystemMXBean.

#### Scenario: CPU chart shows real data
- **WHEN** viewing the Monitor tab for a Java target
- **THEN** the CPU chart shows process CPU % and system CPU % from MBean data

### Requirement: JVM info display
The system SHALL display JVM runtime information.

#### Scenario: JVM info in Info tab
- **WHEN** viewing the Info tab for a Java target
- **THEN** VM name, version, uptime, arguments, loaded classes, and JIT time are shown
