package k8s

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/philipparndt/go-logger"
)

// PortForwardInfo tracks an active port-forward.
type PortForwardInfo struct {
	TargetID   string `json:"targetId"`
	Namespace  string `json:"namespace"`
	PodName    string `json:"podName"`
	Container  string `json:"container"`
	RemotePort int    `json:"remotePort"`
	LocalPort  int    `json:"localPort"`
	cancel     context.CancelFunc
}

// PortForwardManager manages port-forwards for Kubernetes targets.
type PortForwardManager struct {
	mu       sync.RWMutex
	forwards map[string]*PortForwardInfo // keyed by target ID
}

func NewPortForwardManager() *PortForwardManager {
	return &PortForwardManager{
		forwards: make(map[string]*PortForwardInfo),
	}
}

// Start creates a port-forward to a pod using kubectl and returns the local port.
// It waits until the port-forward is ready before returning.
func (m *PortForwardManager) Start(contextName, namespace, podName string, remotePort int, targetID string) (int, error) {
	// Find a free local port
	listener, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return 0, fmt.Errorf("find free port: %w", err)
	}
	localPort := listener.Addr().(*net.TCPAddr).Port
	listener.Close()

	ctx, cancel := context.WithCancel(context.Background())

	info := &PortForwardInfo{
		TargetID:   targetID,
		Namespace:  namespace,
		PodName:    podName,
		RemotePort: remotePort,
		LocalPort:  localPort,
		cancel:     cancel,
	}

	m.mu.Lock()
	if existing, ok := m.forwards[targetID]; ok {
		existing.cancel()
	}
	m.forwards[targetID] = info
	m.mu.Unlock()

	args := []string{
		"port-forward",
		"-n", namespace,
		podName,
		fmt.Sprintf("%d:%d", localPort, remotePort),
	}
	if contextName != "" {
		args = append([]string{"--context", contextName}, args...)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)

	// Capture stderr for error reporting
	stderrPipe, _ := cmd.StderrPipe()
	stdoutPipe, _ := cmd.StdoutPipe()

	if err := cmd.Start(); err != nil {
		cancel()
		m.mu.Lock()
		delete(m.forwards, targetID)
		m.mu.Unlock()
		return 0, fmt.Errorf("start kubectl: %w", err)
	}

	// Wait for "Forwarding from" message or timeout
	ready := make(chan struct{})
	errCh := make(chan string, 1)

	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			line := scanner.Text()
			logger.Debug("kubectl port-forward stdout", "line", line)
			if strings.Contains(line, "Forwarding from") {
				close(ready)
				return
			}
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		var lines []string
		for scanner.Scan() {
			line := scanner.Text()
			logger.Debug("kubectl port-forward stderr", "line", line)
			lines = append(lines, line)
		}
		if len(lines) > 0 {
			errCh <- strings.Join(lines, "; ")
		}
	}()

	// Wait for the process in background — log when it exits
	go func() {
		err := cmd.Wait()
		if ctx.Err() == nil {
			// Process exited unexpectedly (not cancelled by us)
			if err != nil {
				logger.Error("port-forward died unexpectedly", "pod", podName, "error", err)
			} else {
				logger.Warn("port-forward exited cleanly but was not stopped by us", "pod", podName)
			}
		}
		m.mu.Lock()
		delete(m.forwards, targetID)
		m.mu.Unlock()
	}()

	// Wait for readiness or timeout
	select {
	case <-ready:
		logger.Info("port-forward ready", "pod", podName, "local", localPort, "remote", remotePort)
	case errMsg := <-errCh:
		cancel()
		m.mu.Lock()
		delete(m.forwards, targetID)
		m.mu.Unlock()
		return 0, fmt.Errorf("kubectl port-forward failed: %s", errMsg)
	case <-time.After(10 * time.Second):
		cancel()
		m.mu.Lock()
		delete(m.forwards, targetID)
		m.mu.Unlock()
		return 0, fmt.Errorf("port-forward timeout after 10s")
	}

	return localPort, nil
}

// Stop terminates a port-forward.
func (m *PortForwardManager) Stop(targetID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if info, ok := m.forwards[targetID]; ok {
		info.cancel()
		delete(m.forwards, targetID)
		logger.Info("port-forward stopped", "targetId", targetID)
	}
}

// StopAll terminates all port-forwards.
func (m *PortForwardManager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, info := range m.forwards {
		info.cancel()
		delete(m.forwards, id)
	}
}

// Reassign moves a port-forward from one target ID to another without stopping it.
func (m *PortForwardManager) Reassign(oldID, newID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if info, ok := m.forwards[oldID]; ok {
		info.TargetID = newID
		m.forwards[newID] = info
		delete(m.forwards, oldID)
	}
}

// Get returns info about an active port-forward.
func (m *PortForwardManager) Get(targetID string) (*PortForwardInfo, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	info, ok := m.forwards[targetID]
	return info, ok
}
