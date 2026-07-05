package k8s

import (
	"context"
	"fmt"
	"sort"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ResolveWorkload returns the stable controller identity (e.g. Deployment
// "protect") behind a pod. Pod names change on every deploy/restart, so
// connections are tracked by workload and the current pod is resolved on
// (re)connect.
//
// ReplicaSets are followed one hop up to their owning Deployment. Pods
// without a controller resolve to ("Pod", podName).
func ResolveWorkload(kubeconfigPath, contextName, namespace, podName string) (kind, name string, err error) {
	client, err := buildClient(kubeconfigPath, contextName)
	if err != nil {
		return "", "", err
	}

	pod, err := client.CoreV1().Pods(namespace).Get(context.Background(), podName, metav1.GetOptions{})
	if err != nil {
		return "", "", fmt.Errorf("get pod: %w", err)
	}

	owner := controllerOwner(pod.OwnerReferences)
	if owner == nil {
		return "Pod", podName, nil
	}

	if owner.Kind == "ReplicaSet" {
		if dep, ok := replicaSetDeployment(client, namespace, owner.Name); ok {
			return "Deployment", dep, nil
		}
	}
	return owner.Kind, owner.Name, nil
}

// FindPodForWorkload returns the name of the current pod backing a workload,
// preferring Running pods and, among those, the newest.
func FindPodForWorkload(kubeconfigPath, contextName, namespace, kind, name string) (string, error) {
	client, err := buildClient(kubeconfigPath, contextName)
	if err != nil {
		return "", err
	}

	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("list pods: %w", err)
	}

	// rsCache avoids re-fetching a ReplicaSet shared by sibling pods.
	rsCache := map[string]string{}
	var candidates []corev1.Pod
	for _, pod := range pods.Items {
		if podWorkload(client, namespace, &pod, rsCache) == kind+"/"+name {
			candidates = append(candidates, pod)
		}
	}

	if len(candidates) == 0 {
		return "", fmt.Errorf("no pods found for %s %q in namespace %q", strings.ToLower(kind), name, namespace)
	}

	sort.Slice(candidates, func(i, j int) bool {
		ri := candidates[i].Status.Phase == corev1.PodRunning
		rj := candidates[j].Status.Phase == corev1.PodRunning
		if ri != rj {
			return ri
		}
		return candidates[i].CreationTimestamp.After(candidates[j].CreationTimestamp.Time)
	})

	best := candidates[0]
	if best.Status.Phase != corev1.PodRunning {
		return "", fmt.Errorf("no running pod for %s %q (found %d in phase %s)",
			strings.ToLower(kind), name, len(candidates), best.Status.Phase)
	}
	return best.Name, nil
}

func podWorkload(client *kubernetes.Clientset, namespace string, pod *corev1.Pod, rsCache map[string]string) string {
	owner := controllerOwner(pod.OwnerReferences)
	if owner == nil {
		return "Pod/" + pod.Name
	}
	if owner.Kind == "ReplicaSet" {
		dep, ok := rsCache[owner.Name]
		if !ok {
			dep, _ = replicaSetDeployment(client, namespace, owner.Name)
			rsCache[owner.Name] = dep
		}
		if dep != "" {
			return "Deployment/" + dep
		}
	}
	return owner.Kind + "/" + owner.Name
}

func controllerOwner(refs []metav1.OwnerReference) *metav1.OwnerReference {
	for i := range refs {
		if refs[i].Controller != nil && *refs[i].Controller {
			return &refs[i]
		}
	}
	if len(refs) > 0 {
		return &refs[0]
	}
	return nil
}

// replicaSetDeployment returns the Deployment owning a ReplicaSet, if any.
func replicaSetDeployment(client *kubernetes.Clientset, namespace, rsName string) (string, bool) {
	rs, err := client.AppsV1().ReplicaSets(namespace).Get(context.Background(), rsName, metav1.GetOptions{})
	if err != nil {
		return "", false
	}
	owner := controllerOwner(rs.OwnerReferences)
	if owner != nil && owner.Kind == "Deployment" {
		return owner.Name, true
	}
	return "", false
}
