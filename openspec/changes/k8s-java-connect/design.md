## Context

GoProfiler currently connects to targets via direct HTTP URLs (Go pprof) or JMX connection strings (Java, planned). In Kubernetes environments, pod IPs are internal and ports aren't directly reachable from developer machines. `kubectl port-forward` bridges this gap but requires manual setup.

The Kubernetes Go client (`k8s.io/client-go`) provides programmatic access to the same functionality: listing pods, reading container specs, and establishing port-forwards — all using the user's existing kubeconfig.

## Goals / Non-Goals

**Goals:**
- Zero-config Kubernetes connection using existing kubeconfig
- Visual pod browser with search, namespace filtering, and status indicators
- Automatic port-forward setup and teardown
- Auto-detect whether a pod runs Go or Java and which ports to forward
- Works for both Go (pprof) and Java (JMX/async-profiler) targets

**Non-Goals:**
- Cluster management (deploy, scale, delete pods)
- Supporting non-pod workloads (services, deployments) directly — we connect to pods
- In-cluster profiling agent injection (e.g., auto-attaching async-profiler)
- Custom kubeconfig management — we use the system default or a user-specified path

## Decisions

### 1. Use client-go for all Kubernetes interaction

**Decision:** Use `k8s.io/client-go` to load kubeconfig, list pods, read container specs, and establish port-forwards programmatically. No shelling out to `kubectl`.

**Why:** client-go is the standard Go library for Kubernetes. It handles auth, TLS, and API versioning. Port-forwarding is available via `k8s.io/client-go/tools/portforward`. No `kubectl` binary dependency.

**Alternatives considered:**
- Shell out to `kubectl`: Simpler but fragile, requires kubectl installed, harder to manage port-forward lifecycle
- k8s REST API directly: Reinventing client-go

### 2. Pod language detection heuristics

**Decision:** Detect the target language from the pod's container spec:
- **Java**: Container image contains "java", "jdk", "jre", "openjdk", "maven", "gradle", "spring", "quarkus"; or container has JMX port (typically 9999, 1099) or `JAVA_TOOL_OPTIONS`/`JAVA_OPTS` env vars
- **Go**: Container exposes port 6060 (common pprof port); or image name suggests Go; or container has a single statically-linked binary
- **Unknown**: User selects manually

**Why:** Heuristics cover 90% of cases. Fallback to manual selection handles the rest.

### 3. Port-forward manager with lifecycle tracking

**Decision:** Create a `PortForwardManager` that:
- Maps `targetID → portForward` with local port assignment
- Starts port-forwards on connect, stops on disconnect
- Monitors port-forward health (reconnects on failure)
- Uses random available local ports to avoid conflicts
- Stores the pod reference (namespace/name/container) in the target config for reconnection

**Why:** Port-forwards can drop unexpectedly. A managed lifecycle with auto-reconnect provides reliability.

### 4. Connection flow: Cluster → Namespace → Pod → Connect

**Decision:** Multi-step wizard in the connect dialog:
1. **Select cluster context** (from kubeconfig contexts, default pre-selected)
2. **Select namespace** (dropdown, default from context)
3. **Browse pods** (searchable list with status, containers, detected language)
4. **Select pod + container** → auto-detect ports → confirm → connect

**Why:** Progressive disclosure. Most users will accept defaults for context and namespace, so it's fast. Power users can switch.

### 5. Port selection strategy

**Decision:** For each pod/container, detect which ports to forward:
- **Go pprof**: Look for port 6060, or any port with name containing "pprof" or "debug"
- **Java JMX**: Look for ports 9999, 1099, or env vars `JMX_PORT`, `com.sun.management.jmxremote.port`
- **Java async-profiler**: Look for ports 8080 with name "profiler" or similar
- **Custom**: User can specify the port manually

After selecting the port, bind it to a random local port via port-forward.

**Why:** Convention over configuration. Most Java/Go deployments use standard ports. Manual override handles edge cases.

## Risks / Trade-offs

- **[Auth complexity]** Kubernetes auth varies widely (kubeconfig, service accounts, OIDC, exec plugins). → Mitigation: client-go handles all standard auth mechanisms via kubeconfig.
- **[Port-forward stability]** kubectl port-forward is known to drop connections. → Mitigation: Health monitoring with automatic reconnection. Show status in UI.
- **[Large clusters]** Clusters with thousands of pods could make the pod browser slow. → Mitigation: Namespace scoping, search filtering, pagination (limit to 100 pods per request).
- **[RBAC]** User may not have permission to list pods or port-forward. → Mitigation: Show clear error messages. Require at minimum `pods/list` and `pods/portforward` RBAC permissions.
