## Why

Java applications in production almost always run in Kubernetes. Connecting to them for profiling requires multiple manual steps: finding the pod, setting up port-forwards for JMX, remembering ports, and tearing it all down afterward. This friction prevents developers from profiling when they need it most — during production incidents or performance investigations. GoProfiler should make connecting to a Java pod as simple as picking it from a list.

This also applies to Go applications running in Kubernetes — the same pod discovery and port-forward mechanism works for pprof endpoints.

## What Changes

- **Kubernetes cluster connection**: Users can connect to a Kubernetes cluster using their existing kubeconfig (or specify a context/namespace)
- **Pod browser**: A browsable list of pods in the selected namespace, filterable by name/label, showing pod status and container info
- **Language auto-detection**: Pods are analyzed to determine if they run Java (JMX port exposed, JAVA_HOME set) or Go (pprof endpoint) applications
- **Automatic port-forwarding**: When a pod is selected, GoProfiler automatically sets up `kubectl port-forward` to the appropriate port (JMX, pprof, async-profiler agent)
- **Managed lifecycle**: Port-forwards are automatically torn down when the target is disconnected, and reconnected when the user reconnects
- **Namespace/context selector**: Users can switch between Kubernetes contexts and namespaces

## Capabilities

### New Capabilities
- `k8s-discovery`: Browse Kubernetes clusters, namespaces, and pods to discover profiling targets
- `k8s-port-forward`: Automatic port-forward management for connecting to pods
- `k8s-auto-detect`: Detect pod language (Go/Java) and profiling endpoints from container spec

### Modified Capabilities

## Impact

- **Backend**: New `internal/k8s/` package for cluster interaction, pod discovery, and port-forward management. Uses `k8s.io/client-go` library.
- **Frontend**: New K8s connection flow in the connect dialog — cluster/namespace/pod picker with search and filtering
- **Dependencies**: `k8s.io/client-go`, `k8s.io/apimachinery` — standard Kubernetes Go client
- **Desktop-only**: K8s features require local `kubectl` access, so this is a Wails desktop feature (web app could support it if the server has cluster access)
