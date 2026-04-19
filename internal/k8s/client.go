package k8s

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// KubeContext represents an available Kubernetes context.
type KubeContext struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

// ListContexts returns all available Kubernetes contexts from kubeconfig.
func ListContexts(kubeconfigPath string) ([]KubeContext, error) {
	path := resolveKubeconfigPath(kubeconfigPath)

	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}

	var contexts []KubeContext
	for name, ctx := range config.Contexts {
		ns := ctx.Namespace
		if ns == "" {
			ns = "default"
		}
		contexts = append(contexts, KubeContext{
			Name:      name,
			Cluster:   ctx.Cluster,
			Namespace: ns,
			IsCurrent: name == config.CurrentContext,
		})
	}

	return contexts, nil
}

// ListNamespaces returns all namespaces accessible in the given context.
func ListNamespaces(kubeconfigPath, contextName string) ([]string, error) {
	client, err := buildClient(kubeconfigPath, contextName)
	if err != nil {
		return nil, err
	}

	nsList, err := client.CoreV1().Namespaces().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list namespaces: %w", err)
	}

	var names []string
	for _, ns := range nsList.Items {
		names = append(names, ns.Name)
	}
	return names, nil
}

func buildClient(kubeconfigPath, contextName string) (*kubernetes.Clientset, error) {
	config, err := buildConfig(kubeconfigPath, contextName)
	if err != nil {
		return nil, err
	}
	return kubernetes.NewForConfig(config)
}

func buildConfig(kubeconfigPath, contextName string) (*rest.Config, error) {
	path := resolveKubeconfigPath(kubeconfigPath)

	rules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: path}
	overrides := &clientcmd.ConfigOverrides{}
	if contextName != "" {
		overrides.CurrentContext = contextName
	}

	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, overrides).ClientConfig()
}

func resolveKubeconfigPath(path string) string {
	if path != "" {
		return path
	}
	if env := os.Getenv("KUBECONFIG"); env != "" {
		return env
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}

// GetContextConfig returns the raw API config for building port-forwards.
func GetContextConfig(kubeconfigPath, contextName string) (*api.Config, *rest.Config, error) {
	path := resolveKubeconfigPath(kubeconfigPath)
	apiConfig, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return nil, nil, err
	}
	restConfig, err := buildConfig(kubeconfigPath, contextName)
	if err != nil {
		return nil, nil, err
	}
	return apiConfig, restConfig, nil
}
