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

// AsyncProfilerMode represents the profiling mode.
type AsyncProfilerMode string

const (
	APModeCPU   AsyncProfilerMode = "cpu"
	APModeAlloc AsyncProfilerMode = "alloc"
	APModeLock  AsyncProfilerMode = "lock"
	APModeWall  AsyncProfilerMode = "wall"
)

// CheckAsprofAvailable checks if async-profiler (asprof) is in PATH.
func CheckAsprofAvailable() bool {
	_, err := exec.LookPath("asprof")
	return err == nil
}

// StartAsyncProfiler starts async-profiler on a JVM by PID.
func StartAsyncProfiler(pid int, mode AsyncProfilerMode) error {
	event := string(mode)
	args := []string{
		"start",
		"-e", event,
		"-o", "jfr",
		strconv.Itoa(pid),
	}

	cmd := exec.Command("asprof", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("asprof start failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	logger.Info("async-profiler started", "pid", pid, "mode", mode)
	return nil
}

// StopAsyncProfiler stops async-profiler and returns the JFR output.
func StopAsyncProfiler(pid int) ([]byte, error) {
	tmpDir := os.TempDir()
	outputPath := filepath.Join(tmpDir, fmt.Sprintf("asprof_%d_%d.jfr", pid, time.Now().UnixMilli()))

	args := []string{
		"stop",
		"-o", "jfr",
		"-f", outputPath,
		strconv.Itoa(pid),
	}

	cmd := exec.Command("asprof", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("asprof stop failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	logger.Info("async-profiler stopped", "pid", pid, "file", outputPath)

	data, err := os.ReadFile(outputPath)
	if err != nil {
		return nil, fmt.Errorf("read async-profiler output: %w", err)
	}

	os.Remove(outputPath)
	return data, nil
}

// CollectAsyncProfile starts profiling, waits, stops, and returns the JFR data.
func CollectAsyncProfile(ctx context.Context, pid int, durationSec int, mode AsyncProfilerMode) ([]byte, error) {
	if err := StartAsyncProfiler(pid, mode); err != nil {
		return nil, err
	}

	select {
	case <-ctx.Done():
		data, stopErr := StopAsyncProfiler(pid)
		if stopErr != nil {
			return nil, ctx.Err()
		}
		return data, nil
	case <-time.After(time.Duration(durationSec) * time.Second):
	}

	return StopAsyncProfiler(pid)
}
