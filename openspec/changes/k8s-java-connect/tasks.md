## 1. Kubernetes Client Infrastructure

- [ ] 1.1 Add `k8s.io/client-go` and `k8s.io/apimachinery` dependencies
- [ ] 1.2 Create `internal/k8s/client.go` — load kubeconfig, create clientset, list available contexts from kubeconfig file
- [ ] 1.3 Create `internal/k8s/pods.go` — list pods in a namespace with metadata (name, status, containers, ports, env vars, labels, age), with optional name/label filtering
- [ ] 1.4 Create `internal/k8s/detect.go` — language and port detection heuristics: analyze container image name, env vars, and port specs to determine Go/Java and profiling ports

## 2. Port-Forward Manager

- [ ] 2.1 Create `internal/k8s/portforward.go` — `PortForwardManager` that establishes port-forwards using client-go's `portforward` package, mapping targetID → active forward with local/remote port tracking
- [ ] 2.2 Add port-forward health monitoring — periodic check that the forward is alive, auto-reconnect on failure with exponential backoff
- [ ] 2.3 Add lifecycle management — stop individual forwards on disconnect, stop all on shutdown
- [ ] 2.4 Store Kubernetes connection metadata on Target: `K8sContext`, `K8sNamespace`, `K8sPod`, `K8sContainer`, `K8sPort` fields for reconnection

## 3. Backend Wails Bindings

- [ ] 3.1 Add `ListK8sContexts()` binding — returns available kubeconfig contexts with current context marked
- [ ] 3.2 Add `ListK8sNamespaces(context)` binding — returns namespaces for a context
- [ ] 3.3 Add `ListK8sPods(context, namespace, search)` binding — returns pods with detected language, ports, status
- [ ] 3.4 Add `ConnectK8sPod(context, namespace, pod, container, port, language)` binding — sets up port-forward and creates target connection
- [ ] 3.5 Wire port-forward manager into `app.go` — init on startup, cleanup on shutdown, stop on target disconnect
- [ ] 3.6 Update `Reconnect` flow to re-establish port-forward for K8s targets using stored metadata

## 4. Frontend: K8s Connection Wizard

- [ ] 4.1 Create `K8sConnectWizard.tsx` — multi-step wizard component with steps: Context → Namespace → Pod → Confirm
- [ ] 4.2 Step 1: Context selector — dropdown of available contexts with current context pre-selected
- [ ] 4.3 Step 2: Namespace selector — dropdown populated from selected context, default namespace pre-selected
- [ ] 4.4 Step 3: Pod browser — searchable list showing pod name, status badge (Running/Pending/Failed), detected language badge (Go/Java/Unknown), containers, and profiling port
- [ ] 4.5 Step 4: Confirm — show selected pod, container, port, detected language (editable), and "Connect" button
- [ ] 4.6 Integrate wizard into the connect dialog as a "Kubernetes" tab alongside the existing "Direct URL" input

## 5. Frontend: K8s Target Display

- [ ] 5.1 Show K8s connection info in connection detail view — namespace, pod name, container, port-forward status (local:remote port mapping)
- [ ] 5.2 Add K8s icon/badge in sidebar for targets connected via Kubernetes
- [ ] 5.3 Show port-forward health status — green dot when active, yellow when reconnecting, red when failed

## 6. Settings

- [ ] 6.1 Add `kubeconfigPath` setting in the Settings page — optional custom kubeconfig path (defaults to `~/.kube/config`)
