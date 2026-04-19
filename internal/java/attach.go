package java

import (
	"fmt"
	"os"
	"strings"
	"syscall"
)

// ConnectLocalResult holds the result of connecting to a local JVM.
type ConnectLocalResult struct {
	PID       int    `json:"pid"`
	MainClass string `json:"mainClass"`
	JMXPort   int    `json:"jmxPort"`
	URL       string `json:"url"` // localhost:<jmxPort>
}

// ConnectLocal connects to a local JVM by PID, enabling JMX if needed.
func ConnectLocal(pid int) (*ConnectLocalResult, error) {
	// Verify process exists
	if !processExists(pid) {
		return nil, fmt.Errorf("process %d not found", pid)
	}

	// Check if JMX is already enabled
	jmxPort := JMXStatus(pid)

	if jmxPort == 0 {
		// Enable JMX on a random port
		port, err := FindAvailablePort()
		if err != nil {
			return nil, fmt.Errorf("find available port: %w", err)
		}
		if err := EnableJMX(pid, port); err != nil {
			return nil, fmt.Errorf("enable JMX: %w", err)
		}
		jmxPort = port
	}

	// Determine main class name
	mainClass := resolveMainClass(pid)

	return &ConnectLocalResult{
		PID:       pid,
		MainClass: mainClass,
		JMXPort:   jmxPort,
		URL:       fmt.Sprintf("localhost:%d", jmxPort),
	}, nil
}

// processExists checks if a process with the given PID is running.
func processExists(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, FindProcess always succeeds. Send signal 0 to check.
	err = proc.Signal(syscall.Signal(0))
	return err == nil
}

// ProcessAlive checks if a process is still running (for health checks).
func ProcessAlive(pid int) bool {
	return processExists(pid)
}

func resolveMainClass(pid int) string {
	// Try to get main class from jcmd
	jvms, err := discoverViaJcmd()
	if err != nil {
		return ""
	}
	for _, jvm := range jvms {
		if jvm.PID == pid {
			// Clean up the class name
			name := jvm.MainClass
			// Remove package prefix for display
			if idx := strings.LastIndex(name, "."); idx >= 0 {
				return name
			}
			return name
		}
	}
	return fmt.Sprintf("PID %d", pid)
}
