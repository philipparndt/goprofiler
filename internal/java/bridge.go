package java

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
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
	// Look relative to the executable
	exe, _ := exec.LookPath("goprofiler")
	if exe != "" {
		dir := filepath.Dir(exe)
		jar := filepath.Join(dir, "tools", "jmx-bridge", "jmx-bridge.jar")
		return jar
	}
	// Development fallback
	return "tools/jmx-bridge/jmx-bridge.jar"
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

// Placeholder to avoid "unused" warning
var _ = runtime.GOOS
