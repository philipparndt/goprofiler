package java

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/philipparndt/go-logger"
)

// JmxSnapshot represents one monitoring snapshot from the JMX bridge.
type JmxSnapshot struct {
	Heap    JmxMemoryUsage   `json:"heap"`
	NonHeap JmxMemoryUsage   `json:"nonHeap"`
	Pools   []JmxMemoryPool  `json:"pools"`
	GC      []JmxGCCollector `json:"gc"`
	Threads JmxThreadInfo    `json:"threads"`
	CPU     JmxCPUInfo       `json:"cpu"`
	Classes JmxClassInfo     `json:"classes"`
	JIT     JmxJITInfo       `json:"jit"`
	Runtime JmxRuntimeInfo   `json:"runtime"`
	Error   string           `json:"error,omitempty"`
}

type JmxMemoryUsage struct {
	Used      int64 `json:"used"`
	Committed int64 `json:"committed"`
	Max       int64 `json:"max,omitempty"`
}

type JmxMemoryPool struct {
	Name      string `json:"name"`
	Type      string `json:"type"` // HEAP or NON_HEAP
	Used      int64  `json:"used"`
	Committed int64  `json:"committed"`
	Max       int64  `json:"max"`
}

type JmxGCCollector struct {
	Name   string `json:"name"`
	Count  int64  `json:"count"`
	TimeMs int64  `json:"timeMs"`
}

type JmxThreadInfo struct {
	Count  int `json:"count"`
	Daemon int `json:"daemon"`
	Peak   int `json:"peak"`
}

type JmxCPUInfo struct {
	Process float64 `json:"process"`
	System  float64 `json:"system"`
}

type JmxClassInfo struct {
	Loaded   int   `json:"loaded"`
	Unloaded int64 `json:"unloaded"`
}

type JmxJITInfo struct {
	TotalTimeMs int64 `json:"totalTimeMs"`
}

type JmxRuntimeInfo struct {
	UptimeMs  int64  `json:"uptimeMs"`
	VmName    string `json:"vmName"`
	VmVersion string `json:"vmVersion"`
}

// JmxThreadDump represents a thread dump from the JMX bridge.
type JmxThreadDump struct {
	Threads       []JmxThread `json:"threads"`
	DeadlockCount int         `json:"deadlockCount"`
}

type JmxThread struct {
	ID         int64    `json:"id"`
	Name       string   `json:"name"`
	State      string   `json:"state"`
	Deadlocked bool     `json:"deadlocked"`
	Stack      []string `json:"stack,omitempty"`
	WaitingOn  string   `json:"waitingOn,omitempty"`
	LockOwner  string   `json:"lockOwner,omitempty"`
}

// BridgeProcess manages a JMX bridge subprocess.
type BridgeProcess struct {
	mu       sync.Mutex
	cmd      *exec.Cmd
	cancel   context.CancelFunc
	jmxURL   string
	snapCh   chan JmxSnapshot
	running  bool
}

// FindBridgeJar finds the jmx-bridge.jar path.
func FindBridgeJar() string {
	// Check common locations
	candidates := []string{
		"tools/jmx-bridge/jmx-bridge.jar",                    // dev: run from project root
		"../tools/jmx-bridge/jmx-bridge.jar",                 // dev: run from bin/
		filepath.Join(execDir(), "tools", "jmx-bridge", "jmx-bridge.jar"),
		filepath.Join(execDir(), "..", "tools", "jmx-bridge", "jmx-bridge.jar"),
	}
	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			abs, _ := filepath.Abs(path)
			return abs
		}
	}
	// Last resort
	return "tools/jmx-bridge/jmx-bridge.jar"
}

func execDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

// CheckJavaAvailable returns true if java is in PATH.
func CheckJavaAvailable() bool {
	_, err := exec.LookPath("java")
	return err == nil
}

// StartBridgeMonitor starts a bridge process in monitor mode.
// Returns a channel that receives snapshots.
func StartBridgeMonitor(jmxURL string) (*BridgeProcess, <-chan JmxSnapshot, error) {
	if !CheckJavaAvailable() {
		return nil, nil, fmt.Errorf("java not found in PATH — required for JMX monitoring")
	}

	jar := FindBridgeJar()
	ctx, cancel := context.WithCancel(context.Background())

	bp := &BridgeProcess{
		cancel: cancel,
		jmxURL: jmxURL,
		snapCh: make(chan JmxSnapshot, 16),
	}

	go bp.runLoop(ctx, jar)

	return bp, bp.snapCh, nil
}

func (bp *BridgeProcess) runLoop(ctx context.Context, jar string) {
	defer close(bp.snapCh)

	for {
		if ctx.Err() != nil {
			return
		}

		bp.mu.Lock()
		bp.running = true
		bp.mu.Unlock()

		bp.runOnce(ctx, jar)

		bp.mu.Lock()
		bp.running = false
		bp.mu.Unlock()

		// Don't restart if cancelled
		if ctx.Err() != nil {
			return
		}

		logger.Warn("jmx bridge exited, restarting in 2s", "url", bp.jmxURL)
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func (bp *BridgeProcess) runOnce(ctx context.Context, jar string) {
	cmd := exec.CommandContext(ctx, "java", "-jar", jar, bp.jmxURL, "monitor")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return
	}

	if err := cmd.Start(); err != nil {
		logger.Error("start jmx bridge", "error", err)
		return
	}

	bp.mu.Lock()
	bp.cmd = cmd
	bp.mu.Unlock()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 256*1024), 256*1024)

	for scanner.Scan() {
		line := scanner.Text()
		var snap JmxSnapshot
		if err := json.Unmarshal([]byte(line), &snap); err != nil {
			continue
		}
		if snap.Error != "" {
			logger.Error("jmx bridge error", "error", snap.Error)
			continue
		}
		select {
		case bp.snapCh <- snap:
		default:
			// Drop if consumer is slow
		}
	}

	cmd.Wait()
}

// Stop stops the bridge process.
func (bp *BridgeProcess) Stop() {
	bp.cancel()
}

// CaptureThreadDumpViaBridge captures a thread dump using the JMX bridge.
func CaptureThreadDumpViaBridge(jmxURL string) (*JmxThreadDump, error) {
	if !CheckJavaAvailable() {
		return nil, fmt.Errorf("java not found in PATH")
	}

	jar := FindBridgeJar()
	cmd := exec.Command("java", "-jar", jar, jmxURL, "threads")

	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("jmx bridge threads: %w", err)
	}

	var dump JmxThreadDump
	if err := json.Unmarshal(out, &dump); err != nil {
		return nil, fmt.Errorf("parse thread dump: %w", err)
	}

	return &dump, nil
}

// CaptureHeapHistogramViaBridge captures a heap class histogram via the JMX bridge.
// Works for both local and remote JVMs (unlike jcmd which is local-only).
func CaptureHeapHistogramViaBridge(jmxURL string) (*HeapHistogram, error) {
	if !CheckJavaAvailable() {
		return nil, fmt.Errorf("java not found in PATH")
	}

	jar := FindBridgeJar()
	cmd := exec.Command("java", "-jar", jar, jmxURL, "heap")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("jmx bridge heap: %s: %w", string(out), err)
	}

	var hist HeapHistogram
	if err := json.Unmarshal(out, &hist); err != nil {
		return nil, fmt.Errorf("parse heap histogram: %w", err)
	}

	if hist.TotalBytes == 0 && len(hist.Classes) > 0 {
		for _, c := range hist.Classes {
			hist.TotalBytes += c.Bytes
			hist.TotalInstances += c.Instances
		}
	}

	return &hist, nil
}

// CollectJFRViaBridge starts a JFR recording via the JMX bridge, waits, then stops and returns the data.
func CollectJFRViaBridge(ctx context.Context, jmxURL string, durationSec int, profileType JFRProfileType) ([]byte, error) {
	if !CheckJavaAvailable() {
		return nil, fmt.Errorf("java not found in PATH")
	}

	jar := FindBridgeJar()
	settings := JFRSettingsForProfile(profileType)

	logger.Info("jfr via bridge", "jar", jar, "url", jmxURL, "duration", durationSec, "settings", settings)

	// Start recording
	startCmd := exec.CommandContext(ctx, "java", "-jar", jar, jmxURL, "jfr", "start", "goprofiler", settings)
	startOut, err := startCmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("jfr start: %w", err)
	}

	// Parse recording ID from response
	var startResult struct {
		RecordingID int64  `json:"recordingId"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(startOut, &startResult); err != nil {
		return nil, fmt.Errorf("parse jfr start response %q: %w", string(startOut), err)
	}
	if startResult.Error != "" {
		return nil, fmt.Errorf("jfr start: %s", startResult.Error)
	}

	recID := fmt.Sprintf("%d", startResult.RecordingID)

	// Wait for duration
	select {
	case <-ctx.Done():
	case <-time.After(time.Duration(durationSec) * time.Second):
	}

	// Stop and dump recording
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("goprofiler-jfr-%s.jfr", recID))
	stopCmd := exec.Command("java", "-jar", jar, jmxURL, "jfr", "stop", recID, tmpFile)
	stopOut, err := stopCmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("jfr stop: %w", err)
	}

	var stopResult struct {
		File  string `json:"file"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(stopOut, &stopResult); err != nil {
		return nil, fmt.Errorf("parse jfr stop: %w", err)
	}
	if stopResult.Error != "" {
		return nil, fmt.Errorf("jfr stop: %s", stopResult.Error)
	}

	// Read the JFR file
	data, err := os.ReadFile(tmpFile)
	if err != nil {
		return nil, fmt.Errorf("read jfr: %w", err)
	}
	os.Remove(tmpFile)

	return data, nil
}

// Placeholder to avoid "unused" warning
var _ = runtime.GOOS
