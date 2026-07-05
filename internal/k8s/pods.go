package k8s

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Pod annotations (or labels) that explicitly mark a pod as profilable.
// Needed for pods that cannot declare their pprof/JMX port in the pod spec —
// e.g. hostNetwork pods, where a declared containerPort would claim the port
// on the node itself.
const (
	annotationLanguage = "goprofiler.io/language" // "go" or "java"
	annotationPort     = "goprofiler.io/port"     // e.g. "6060"
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

		running := pod.Status.Phase == corev1.PodRunning
		for _, c := range pod.Spec.Containers {
			ci := ContainerInfo{
				Name:  c.Name,
				Image: c.Image,
			}

			if running {
				lang := detectLanguage(c)
				if lang != "unknown" && info.Language == "unknown" {
					info.Language = lang
				}
				ci.ProfilingPort = detectProfilingPort(c, lang)
			}
			info.Containers = append(info.Containers, ci)
		}

		applyProfilingOverrides(&pod, &info)

		result = append(result, info)
	}

	return result, nil
}

// applyProfilingOverrides applies explicit goprofiler.io/* annotations or
// labels, which take precedence over image/port-based detection.
func applyProfilingOverrides(pod *corev1.Pod, info *PodInfo) {
	lookup := func(key string) string {
		if v, ok := pod.Annotations[key]; ok {
			return v
		}
		return pod.Labels[key]
	}

	if lang := lookup(annotationLanguage); lang == "go" || lang == "java" {
		info.Language = lang
	}

	if portStr := lookup(annotationPort); portStr != "" {
		port, err := strconv.Atoi(portStr)
		if err != nil || port <= 0 || port > 65535 || len(info.Containers) == 0 {
			return
		}
		info.Containers[0].ProfilingPort = port
		// A declared profiling port implies the pod is profilable; assume Go
		// unless the language says otherwise.
		if info.Language == "unknown" {
			info.Language = "go"
		}
	}
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

	// Go detection — only trust pprof-specific signals.
	// "debug"-named ports are commonly Delve (port 2345), not pprof.
	for _, port := range c.Ports {
		if port.ContainerPort == 6060 || strings.Contains(strings.ToLower(port.Name), "pprof") {
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
