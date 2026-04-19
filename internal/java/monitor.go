package java

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/philipparndt/go-logger"
)

const MaxPoints = 7200 // 2 hours at 1s intervals

type JavaDataPoint struct {
	Timestamp     time.Time `json:"timestamp"`
	HeapUsed      int64     `json:"heapUsed"`
	HeapCommitted int64     `json:"heapCommitted"`
	HeapMax       int64     `json:"heapMax"`
	CpuPercent    float64   `json:"cpuPercent"`
	ThreadCount   int       `json:"threadCount"`
	ThreadPeak    int       `json:"threadPeak"`
	GCCount       int64     `json:"gcCount"`
	GCTimeMs      int64     `json:"gcTimeMs"`
}

type JavaHistoryResponse struct {
	Points []JavaDataPoint `json:"points"`
}

type javaTargetData struct {
	mu     sync.RWMutex
	points []JavaDataPoint
}

type javaTargetWorker struct {
	cancel context.CancelFunc
}

type JavaMonitorService struct {
	mu       sync.RWMutex
	data     map[string]*javaTargetData   // keyed by address (host:port)
	workers  map[string]*javaTargetWorker // keyed by target ID
	addrs    map[string]string            // target ID -> address
	pids     map[string]int               // address -> local PID (if known)
	bridges  map[string]*BridgeProcess    // address -> bridge monitor process
}

func NewJavaMonitorService() *JavaMonitorService {
	return &JavaMonitorService{
		data:    make(map[string]*javaTargetData),
		workers: make(map[string]*javaTargetWorker),
		addrs:   make(map[string]string),
		pids:    make(map[string]int),
		bridges: make(map[string]*BridgeProcess),
	}
}

func (s *JavaMonitorService) SetPid(address string, pid int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pids[address] = pid
}

func (s *JavaMonitorService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, w := range s.workers {
		w.cancel()
		delete(s.workers, id)
	}
}

func (s *JavaMonitorService) StartTarget(id, address string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if w, ok := s.workers[id]; ok {
		w.cancel()
		delete(s.workers, id)
	}

	if _, ok := s.data[address]; !ok {
		s.data[address] = &javaTargetData{}
	}

	s.addrs[id] = address

	ctx, cancel := context.WithCancel(context.Background())
	s.workers[id] = &javaTargetWorker{cancel: cancel}

	// Try to start JMX bridge monitor (preferred, works locally and remotely)
	if CheckJavaAvailable() {
		if _, exists := s.bridges[address]; !exists {
			bp, snapCh, err := StartBridgeMonitor(address)
			if err == nil {
				s.bridges[address] = bp
				logger.Info("java monitor started via bridge", "id", id, "address", address)
				go s.consumeBridge(ctx, address, snapCh)
				return
			}
			logger.Warn("jmx bridge failed, falling back to jcmd", "error", err)
		}
	}

	// Fallback to jcmd polling (local JVMs only)
	logger.Info("java monitor started via jcmd", "id", id, "address", address)
	go s.pollLoop(ctx, address)
}

func (s *JavaMonitorService) StopTarget(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if w, ok := s.workers[id]; ok {
		w.cancel()
		delete(s.workers, id)
	}
	if addr, ok := s.addrs[id]; ok {
		// Stop bridge if no other targets use this address
		otherUsers := false
		for otherId, otherAddr := range s.addrs {
			if otherId != id && otherAddr == addr {
				otherUsers = true
				break
			}
		}
		if !otherUsers {
			if bp, ok := s.bridges[addr]; ok {
				bp.Stop()
				delete(s.bridges, addr)
			}
		}
		delete(s.addrs, id)
	}
	logger.Info("java monitor stopped", "id", id)
}

func (s *JavaMonitorService) consumeBridge(ctx context.Context, address string, snapCh <-chan JmxSnapshot) {
	for {
		select {
		case <-ctx.Done():
			return
		case snap, ok := <-snapCh:
			if !ok {
				return
			}

			// Convert bridge snapshot to data point
			var totalGcCount, totalGcTime int64
			for _, gc := range snap.GC {
				totalGcCount += gc.Count
				totalGcTime += gc.TimeMs
			}

			point := JavaDataPoint{
				Timestamp:     time.Now(),
				HeapUsed:      snap.Heap.Used,
				HeapCommitted: snap.Heap.Committed,
				HeapMax:       snap.Heap.Max,
				CpuPercent:    snap.CPU.Process * 100,
				ThreadCount:   snap.Threads.Count,
				ThreadPeak:    snap.Threads.Peak,
				GCCount:       totalGcCount,
				GCTimeMs:      totalGcTime,
			}

			s.mu.RLock()
			td := s.data[address]
			s.mu.RUnlock()

			if td == nil {
				continue
			}

			td.mu.Lock()
			td.points = append(td.points, point)
			if len(td.points) > MaxPoints {
				td.points = td.points[len(td.points)-MaxPoints:]
			}
			td.mu.Unlock()
		}
	}
}

func (s *JavaMonitorService) GetHistory(address string, since time.Time) *JavaHistoryResponse {
	s.mu.RLock()
	td, ok := s.data[address]
	s.mu.RUnlock()

	if !ok {
		return &JavaHistoryResponse{Points: []JavaDataPoint{}}
	}

	td.mu.RLock()
	defer td.mu.RUnlock()

	var points []JavaDataPoint
	if since.IsZero() {
		points = make([]JavaDataPoint, len(td.points))
		copy(points, td.points)
	} else {
		for _, p := range td.points {
			if p.Timestamp.After(since) {
				points = append(points, p)
			}
		}
	}
	if points == nil {
		points = []JavaDataPoint{}
	}
	return &JavaHistoryResponse{Points: points}
}

func (s *JavaMonitorService) pollLoop(ctx context.Context, address string) {
	s.pollOnce(address)

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pollOnce(address)
		}
	}
}

func (s *JavaMonitorService) pollOnce(address string) {
	point := JavaDataPoint{Timestamp: time.Now()}

	s.mu.RLock()
	pid := s.pids[address]
	s.mu.RUnlock()

	if pid > 0 {
		if p, err := FetchJVMStatsViaJcmd(pid); err == nil {
			point.HeapUsed = p.HeapUsed
			point.HeapCommitted = p.HeapCommitted
			point.HeapMax = p.HeapMax
		}
	}

	s.mu.RLock()
	td := s.data[address]
	s.mu.RUnlock()

	if td == nil {
		return
	}

	td.mu.Lock()
	defer td.mu.Unlock()

	td.points = append(td.points, point)
	if len(td.points) > MaxPoints {
		td.points = td.points[len(td.points)-MaxPoints:]
	}
}

// FetchJVMStatsViaJcmd gets JVM stats for a local JVM by PID using jcmd.
func FetchJVMStatsViaJcmd(pid int) (*JavaDataPoint, error) {
	cmd := exec.Command("jcmd", strconv.Itoa(pid), "GC.heap_info")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("jcmd GC.heap_info failed: %w", err)
	}

	point := &JavaDataPoint{Timestamp: time.Now()}

	// Parse output like:
	//   garbage-first heap   total 565248K, used 328475K [0x..., 0x...)
	//   Metaspace       used 8254K, committed 8512K, reserved 1114112K
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)

		// Main heap line: "... total NNNNK, used NNNNK ..."
		if strings.Contains(line, "heap") && strings.Contains(line, "total") {
			point.HeapCommitted = extractKValue(line, "total")
			point.HeapUsed = extractKValue(line, "used")
			// Max heap from the address range [start, end)
			// For G1, total ≈ committed. Max is from JVM flags, use reserved from Metaspace line as approximation
		}

		// Check for reserved (max) from the address range
		if strings.Contains(line, "heap") && strings.Contains(line, "[") {
			// Parse [0x..start, 0x..end) to compute max
			if idx := strings.Index(line, "["); idx >= 0 {
				addrPart := line[idx:]
				addrPart = strings.Trim(addrPart, "[]() ")
				parts := strings.Split(addrPart, ",")
				if len(parts) >= 2 {
					startStr := strings.TrimSpace(parts[0])
					endStr := strings.TrimSpace(strings.TrimSuffix(parts[1], ")"))
					start, e1 := strconv.ParseUint(strings.TrimPrefix(startStr, "0x"), 16, 64)
					end, e2 := strconv.ParseUint(strings.TrimPrefix(endStr, "0x"), 16, 64)
					if e1 == nil && e2 == nil && end > start {
						point.HeapMax = int64(end - start)
					}
				}
			}
		}
	}

	return point, nil
}

// extractKValue finds "keyword NNNNK" in a line and returns bytes.
func extractKValue(line, keyword string) int64 {
	idx := strings.Index(line, keyword)
	if idx < 0 {
		return 0
	}
	rest := line[idx+len(keyword):]
	fields := strings.Fields(rest)
	if len(fields) == 0 {
		return 0
	}
	valStr := strings.TrimSuffix(strings.TrimSuffix(fields[0], ","), "K")
	v, err := strconv.ParseInt(valStr, 10, 64)
	if err != nil {
		return 0
	}
	return v * 1024
}

func parseKilobytes(line string) int64 {
	// Extract numbers followed by K, M, or G
	fields := strings.Fields(line)
	for _, f := range fields {
		f = strings.TrimRight(f, ",")
		if strings.HasSuffix(f, "K") {
			if v, err := strconv.ParseInt(strings.TrimSuffix(f, "K"), 10, 64); err == nil {
				return v * 1024
			}
		}
		if strings.HasSuffix(f, "M") {
			if v, err := strconv.ParseInt(strings.TrimSuffix(f, "M"), 10, 64); err == nil {
				return v * 1024 * 1024
			}
		}
		if strings.HasSuffix(f, "G") {
			if v, err := strconv.ParseInt(strings.TrimSuffix(f, "G"), 10, 64); err == nil {
				return v * 1024 * 1024 * 1024
			}
		}
	}
	return 0
}
