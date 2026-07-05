package k8s

import (
	"github.com/philipparndt/go-logger"
)

// DiscoveryResult is the single response for the K8s discovery endpoint.
// The backend resolves context, namespaces, and pods in one call.
type DiscoveryResult struct {
	CurrentContext string        `json:"currentContext"`
	Contexts       []KubeContext `json:"contexts"`
	Namespaces     []string      `json:"namespaces"`
	Pods           []PodInfo     `json:"pods"`
	// PodsError carries a pod-listing failure. Contexts/namespaces may still
	// be usable, so the listing error is reported alongside the partial
	// result instead of failing the whole discovery — the UI must show it
	// rather than render an empty pod list as "no pods found".
	PodsError string `json:"podsError,omitempty"`
}

// Discover loads the full K8s state in one call: contexts, namespaces for the
// selected context, and pods for the selected namespace.
// If contextName is empty, uses the current context.
// If namespace is empty, lists pods across all namespaces.
func Discover(kubeconfigPath, contextName, namespace, search string) (*DiscoveryResult, error) {
	// 1. Load contexts
	contexts, err := ListContexts(kubeconfigPath)
	if err != nil {
		return nil, err
	}

	// Resolve context
	if contextName == "" {
		for _, c := range contexts {
			if c.IsCurrent {
				contextName = c.Name
				break
			}
		}
	}

	// 2. Load namespaces for the selected context
	namespaces, err := ListNamespaces(kubeconfigPath, contextName)
	if err != nil {
		// Non-fatal — user might not have namespace list permission
		logger.Warn("k8s discover: list namespaces failed", "context", contextName, "error", err)
		namespaces = []string{}
	}

	// 3. Load pods
	podsError := ""
	pods, err := ListPods(kubeconfigPath, contextName, namespace, search)
	if err != nil {
		logger.Error("k8s discover: list pods failed", "context", contextName, "namespace", namespace, "error", err)
		pods = []PodInfo{}
		podsError = err.Error()
	}

	return &DiscoveryResult{
		CurrentContext: contextName,
		Contexts:       contexts,
		Namespaces:     namespaces,
		Pods:           pods,
		PodsError:      podsError,
	}, nil
}
