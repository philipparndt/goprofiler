package java

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// LocalJVM represents a discovered JVM running on the local machine.
type LocalJVM struct {
	PID       int    `json:"pid"`
	MainClass string `json:"mainClass"`
	Args      string `json:"args,omitempty"`
	JMXPort   int    `json:"jmxPort,omitempty"` // 0 if JMX not enabled
	AsprofOK  bool   `json:"asprofAvailable"`
}

// DiscoverLocalJVMs lists all JVMs running on the local machine.
func DiscoverLocalJVMs() ([]LocalJVM, error) {
	jvms, err := discoverViaJcmd()
	if err != nil {
		jvms, err = discoverViaJps()
		if err != nil {
			return nil, fmt.Errorf("neither jcmd nor jps available: %w", err)
		}
	}

	// Filter out tool processes and our own PID
	selfPID := os.Getpid()
	asprofAvailable := CheckAsprofAvailable()

	var filtered []LocalJVM
	for _, jvm := range jvms {
		if jvm.PID == selfPID {
			continue
		}
		main := strings.ToLower(jvm.MainClass)
		if main == "jdk.jcmd/sun.tools.jcmd.jcmd" || main == "sun.tools.jps.jps" ||
			main == "jcmd" || main == "jps" || main == "" {
			continue
		}

		// Check JMX status
		jvm.JMXPort = JMXStatus(jvm.PID)
		jvm.AsprofOK = asprofAvailable

		filtered = append(filtered, jvm)
	}

	return filtered, nil
}

func discoverViaJcmd() ([]LocalJVM, error) {
	path, err := exec.LookPath("jcmd")
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(path, "-l")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("jcmd -l: %w", err)
	}

	return parseJcmdOutput(string(out)), nil
}

func parseJcmdOutput(output string) []LocalJVM {
	var jvms []LocalJVM
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		pid, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		mainClass := ""
		args := ""
		if len(parts) > 1 {
			rest := parts[1]
			// Main class is the first token, args follow
			classParts := strings.SplitN(rest, " ", 2)
			mainClass = classParts[0]
			if len(classParts) > 1 {
				args = classParts[1]
			}
		}
		jvms = append(jvms, LocalJVM{
			PID:       pid,
			MainClass: mainClass,
			Args:      args,
		})
	}
	return jvms
}

func discoverViaJps() ([]LocalJVM, error) {
	path, err := exec.LookPath("jps")
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(path, "-lv")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("jps -lv: %w", err)
	}

	return parseJcmdOutput(string(out)), nil // Same format: PID MainClass [args]
}
