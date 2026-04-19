package k8s

import (
	"context"
	"fmt"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// PodInfo represents a discovered pod with profiling-relevant metadata.
type PodInfo struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Status     string            `json:"status"` // Running, Pending, Failed, etc.
	Age        string            `json:"age"`
	Containers []ContainerInfo   `json:"containers"`
	Language   string            `json:"language"` // "go", "java", "unknown"
	Labels     map[string]string `json:"labels,omitempty"`
}

// ContainerInfo represents a container within a pod.
type ContainerInfo struct {
	Name          string `json:"name"`
	Image         string `json:"image"`
	ProfilingPort int    `json:"profilingPort,omitempty"`
}

// ListPods returns pods in the given namespace with profiling metadata.
func ListPods(kubeconfigPath, contextName, namespace, search string) ([]PodInfo, error) {
	client, err := buildClient(kubeconfigPath, contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods: %w", err)
	}

	var result []PodInfo
	searchLower := strings.ToLower(search)

	for _, pod := range pods.Items {
		// Filter by search term
		if search != "" {
			nameMatch := strings.Contains(strings.ToLower(pod.Name), searchLower)
			labelMatch := false
			for k, v := range pod.Labels {
				if strings.Contains(strings.ToLower(k+"="+v), searchLower) {
					labelMatch = true
					break
				}
			}
			if !nameMatch && !labelMatch {
				continue
			}
		}

		info := PodInfo{
			Name:      pod.Name,
			Namespace: pod.Namespace,
			Status:    string(pod.Status.Phase),
			Age:       formatAge(pod.CreationTimestamp.Time),
			Labels:    pod.Labels,
			Language:  "unknown",
		}

		for _, c := range pod.Spec.Containers {
			ci := ContainerInfo{
				Name:  c.Name,
				Image: c.Image,
			}

			// Detect language and profiling port
			lang := detectLanguage(c)
			if lang != "unknown" && info.Language == "unknown" {
				info.Language = lang
			}

			ci.ProfilingPort = detectProfilingPort(c, lang)
			info.Containers = append(info.Containers, ci)
		}

		result = append(result, info)
	}

	return result, nil
}

func detectLanguage(c corev1.Container) string {
	image := strings.ToLower(c.Image)

	// Java detection
	javaKeywords := []string{"java", "jdk", "jre", "openjdk", "spring", "quarkus", "maven", "gradle", "tomcat", "wildfly"}
	for _, kw := range javaKeywords {
		if strings.Contains(image, kw) {
			return "java"
		}
	}
	for _, env := range c.Env {
		name := strings.ToUpper(env.Name)
		if name == "JAVA_TOOL_OPTIONS" || name == "JAVA_OPTS" || name == "JMX_PORT" || name == "JAVA_HOME" {
			return "java"
		}
	}

	// Go detection
	for _, port := range c.Ports {
		if port.ContainerPort == 6060 || strings.Contains(strings.ToLower(port.Name), "pprof") || strings.Contains(strings.ToLower(port.Name), "debug") {
			return "go"
		}
	}

	return "unknown"
}

func detectProfilingPort(c corev1.Container, language string) int {
	switch language {
	case "go":
		for _, p := range c.Ports {
			if p.ContainerPort == 6060 || strings.Contains(strings.ToLower(p.Name), "pprof") {
				return int(p.ContainerPort)
			}
		}
		return 6060 // default Go pprof port
	case "java":
		// Check JMX port from env vars
		for _, env := range c.Env {
			if env.Name == "JMX_PORT" || strings.Contains(env.Name, "jmxremote.port") {
				// Try to parse, fall back to default
				return 9999
			}
		}
		for _, p := range c.Ports {
			port := int(p.ContainerPort)
			if port == 9999 || port == 1099 {
				return port
			}
		}
		return 9999 // default JMX port
	default:
		return 0
	}
}

func formatAge(t time.Time) string {
	d := time.Since(t)
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}
