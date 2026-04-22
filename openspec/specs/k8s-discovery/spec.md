# k8s-discovery Specification

## Purpose
TBD - created by archiving change k8s-java-connect. Update Purpose after archive.
## Requirements
### Requirement: Load Kubernetes contexts from kubeconfig
The system SHALL load available Kubernetes cluster contexts from the user's kubeconfig file.

#### Scenario: Default kubeconfig
- **WHEN** the user opens the Kubernetes connection flow
- **THEN** the system loads contexts from `~/.kube/config` and shows the current context as default

#### Scenario: Custom kubeconfig path
- **WHEN** the user specifies a custom kubeconfig path in settings
- **THEN** the system loads contexts from that file

#### Scenario: No kubeconfig found
- **WHEN** no kubeconfig file exists
- **THEN** the system shows an error with instructions on setting up kubectl

### Requirement: Browse namespaces
The system SHALL list available namespaces for the selected cluster context.

#### Scenario: List namespaces
- **WHEN** a cluster context is selected
- **THEN** the system lists all namespaces the user has access to, with the context's default namespace pre-selected

### Requirement: Browse pods
The system SHALL list pods in the selected namespace with status and metadata.

#### Scenario: Pod list
- **WHEN** a namespace is selected
- **THEN** the system shows pods with: name, status (Running/Pending/etc.), containers, detected language, age, and labels

#### Scenario: Search and filter
- **WHEN** the user types in the search field
- **THEN** pods are filtered by name or label match

#### Scenario: Pod status indicators
- **WHEN** a pod is in a non-Running state
- **THEN** its status is shown with appropriate coloring (green=Running, yellow=Pending, red=Failed)

### Requirement: Kubernetes connection in connect dialog
The system SHALL provide a "Kubernetes" connection option alongside direct URL and JMX connections.

#### Scenario: Connect dialog shows K8s option
- **WHEN** the user opens the connect dialog
- **THEN** a "Kubernetes" tab/option is available alongside "Direct URL"

#### Scenario: K8s wizard flow
- **WHEN** the user selects "Kubernetes"
- **THEN** a wizard guides them through: context → namespace → pod → connect

