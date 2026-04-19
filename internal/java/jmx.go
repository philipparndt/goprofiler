package java

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"github.com/philipparndt/go-logger"
)

// JMXClient provides JMX access to a JVM via jcmd.
type JMXClient struct {
	Host string
	Port int
}

// NewJMXClient creates a JMX client for the given host:port.
func NewJMXClient(host string, port int) *JMXClient {
	return &JMXClient{Host: host, Port: port}
}

// ParseJMXAddress parses "host:port" or just "port" into host and port.
func ParseJMXAddress(addr string) (string, int, error) {
	addr = strings.TrimSpace(addr)

	// Try host:port
	if i := strings.LastIndex(addr, ":"); i >= 0 {
		host := addr[:i]
		port, err := strconv.Atoi(addr[i+1:])
		if err != nil {
			return "", 0, fmt.Errorf("invalid port in %q: %w", addr, err)
		}
		if host == "" {
			host = "localhost"
		}
		return host, port, nil
	}

	// Try just port
	port, err := strconv.Atoi(addr)
	if err != nil {
		return "", 0, fmt.Errorf("invalid JMX address %q: expected host:port or port number", addr)
	}
	return "localhost", port, nil
}

// CheckJcmdAvailable returns true if jcmd is in PATH.
func CheckJcmdAvailable() bool {
	_, err := exec.LookPath("jcmd")
	return err == nil
}

// EnableJMX enables the JMX management agent on a local JVM via jcmd.
// Returns the port JMX was started on.
func EnableJMX(pid int, port int) error {
	args := []string{
		strconv.Itoa(pid),
		"ManagementAgent.start",
		fmt.Sprintf("jmxremote.port=%d", port),
		"jmxremote.authenticate=false",
		"jmxremote.ssl=false",
	}
	cmd := exec.Command("jcmd", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("jcmd ManagementAgent.start failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	logger.Info("JMX enabled", "pid", pid, "port", port)
	return nil
}

// JMXStatus checks if JMX is enabled on a JVM and returns the port, or 0 if not enabled.
func JMXStatus(pid int) int {
	cmd := exec.Command("jcmd", strconv.Itoa(pid), "ManagementAgent.status")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return 0
	}
	// Look for "jmxremote.port" in output — formats vary:
	//   "jmxremote.port=9999" or "com.sun.management.jmxremote.port = 9999"
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "jmxremote.port") {
			// Extract the value after = (with possible spaces)
			if idx := strings.LastIndex(line, "="); idx >= 0 {
				portStr := strings.TrimSpace(line[idx+1:])
				if p, err := strconv.Atoi(portStr); err == nil {
					return p
				}
			}
		}
	}
	return 0
}

// ValidateJMX checks if a JMX connection can be established to the given host:port.
// Uses jcmd for local connections or a simple TCP check for remote.
func ValidateJMX(host string, port int) error {
	// Simple TCP connectivity check
	addr := fmt.Sprintf("%s:%d", host, port)
	cmd := exec.Command("nc", "-z", "-w", "2", host, strconv.Itoa(port))
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("cannot connect to JMX at %s: %w", addr, err)
	}
	return nil
}
