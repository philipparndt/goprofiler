package java

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/philipparndt/go-logger"
)

// StartJFRRecording starts a JFR recording on a local JVM.
// Returns the recording name for use with StopJFRRecording.
func StartJFRRecording(pid int, settings string) (string, error) {
	name := fmt.Sprintf("goprofiler_%d", time.Now().UnixMilli())

	args := []string{
		strconv.Itoa(pid),
		"JFR.start",
		"name=" + name,
	}
	if settings != "" {
		args = append(args, "settings="+settings)
	}

	cmd := exec.Command("jcmd", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("JFR.start failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	logger.Info("JFR recording started", "pid", pid, "name", name)
	return name, nil
}

// StopJFRRecording stops a JFR recording and returns the .jfr file contents.
func StopJFRRecording(pid int, name string) ([]byte, error) {
	tmpDir := os.TempDir()
	outputPath := filepath.Join(tmpDir, name+".jfr")

	args := []string{
		strconv.Itoa(pid),
		"JFR.stop",
		"name=" + name,
		"filename=" + outputPath,
	}

	cmd := exec.Command("jcmd", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("JFR.stop failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	logger.Info("JFR recording stopped", "pid", pid, "name", name, "file", outputPath)

	data, err := os.ReadFile(outputPath)
	if err != nil {
		return nil, fmt.Errorf("read JFR file: %w", err)
	}

	os.Remove(outputPath)
	return data, nil
}

// CollectJFRProfile starts a JFR recording, waits for the specified duration, then stops and returns the data.
func CollectJFRProfile(ctx context.Context, pid int, durationSec int, settings string) ([]byte, error) {
	name, err := StartJFRRecording(pid, settings)
	if err != nil {
		return nil, err
	}

	select {
	case <-ctx.Done():
		// Cancelled — still try to collect what we have
		data, stopErr := StopJFRRecording(pid, name)
		if stopErr != nil {
			return nil, ctx.Err()
		}
		return data, nil
	case <-time.After(time.Duration(durationSec) * time.Second):
	}

	return StopJFRRecording(pid, name)
}

// JFRSettingsForProfile returns JFR settings string for the given profile type.
func JFRSettingsForProfile(profileType JFRProfileType) string {
	switch profileType {
	case JFRProfileCPU:
		return "profile"
	case JFRProfileAlloc:
		return "profile"
	case JFRProfileLock:
		return "profile"
	default:
		return "default"
	}
}
