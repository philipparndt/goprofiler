## ADDED Requirements

### Requirement: Automatic port-forward on connect
The system SHALL automatically establish a kubectl port-forward when connecting to a Kubernetes pod.

#### Scenario: Port-forward established
- **WHEN** the user selects a pod and clicks connect
- **THEN** the system creates a port-forward from a random local port to the target port in the pod, and connects to the local endpoint

#### Scenario: Port-forward for Go pprof
- **WHEN** connecting to a Go pod with pprof on port 6060
- **THEN** a port-forward is created to 6060 and the target URL is set to `http://localhost:{localPort}`

#### Scenario: Port-forward for Java JMX
- **WHEN** connecting to a Java pod with JMX on port 9999
- **THEN** a port-forward is created to 9999 and the JMX connection uses `localhost:{localPort}`

### Requirement: Port-forward lifecycle management
The system SHALL manage port-forward lifecycle tied to the target connection.

#### Scenario: Disconnect tears down port-forward
- **WHEN** the user disconnects a Kubernetes target
- **THEN** the port-forward is stopped and the local port is released

#### Scenario: Port-forward health monitoring
- **WHEN** a port-forward connection drops
- **THEN** the system attempts to re-establish it and updates the target status accordingly

#### Scenario: App shutdown cleanup
- **WHEN** the application shuts down
- **THEN** all active port-forwards are stopped cleanly

### Requirement: Port-forward status visibility
The system SHALL show the port-forward status in the UI.

#### Scenario: Active port-forward indicator
- **WHEN** a target is connected via Kubernetes port-forward
- **THEN** the connection detail shows "K8s: {namespace}/{pod}:{port} → localhost:{localPort}" with a status indicator

### Requirement: Reconnect Kubernetes targets
The system SHALL support reconnecting to previously connected Kubernetes targets.

#### Scenario: Reconnect saved K8s target
- **WHEN** the user reconnects a saved Kubernetes target
- **THEN** the system re-establishes the port-forward to the same pod (if it still exists) and reconnects
