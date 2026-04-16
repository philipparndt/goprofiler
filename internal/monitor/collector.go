package monitor

import (
	"context"
	"net/http"
	"sync"
	"time"

	vlog "github1.vg.vector.int/pes/vehub-vlog-go"
)

const MaxPoints = 300

type DataPoint struct {
	Timestamp     time.Time `json:"timestamp"`
	HeapAlloc     uint64    `json:"heapAlloc"`
	HeapSys       uint64    `json:"heapSys"`
	Sys           uint64    `json:"sys"`
	NumGC         uint64    `json:"numGC"`
	PauseTotalNs  uint64    `json:"pauseTotalNs"`
	LastPauseNs   uint64    `json:"lastPauseNs"`
	NumGoroutines uint64    `json:"numGoroutines"`
}

type GCEvent struct {
	Timestamp time.Time `json:"timestamp"`
	PauseNs   uint64    `json:"pauseNs"`
	GCNum     uint64    `json:"gcNum"`
}

type HistoryResponse struct {
	Points   []DataPoint `json:"points"`
	GCEvents []GCEvent   `json:"gcEvents"`
}

type targetData struct {
	mu       sync.RWMutex
	points   []DataPoint
	gcEvents []GCEvent
	lastGC   uint64
}

type targetWorker struct {
	cancel context.CancelFunc
}

type Service struct {
	mu      sync.RWMutex
	data    map[string]*targetData  // keyed by URL
	workers map[string]*targetWorker // keyed by target ID
	client  *http.Client
}

func NewService() *Service {
	return &Service{
		data:    make(map[string]*targetData),
		workers: make(map[string]*targetWorker),
		client:  &http.Client{Timeout: 5 * time.Second},
	}
}

func (s *Service) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, w := range s.workers {
		w.cancel()
		delete(s.workers, id)
	}
}

func (s *Service) StartTarget(id, url string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Stop existing worker if any
	if w, ok := s.workers[id]; ok {
		w.cancel()
		delete(s.workers, id)
	}

	// Ensure data buffer exists for this URL
	if _, ok := s.data[url]; !ok {
		s.data[url] = &targetData{}
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.workers[id] = &targetWorker{cancel: cancel}

	vlog.Info("memory monitor started", "id", id, "url", url)
	go s.pollLoop(ctx, url)
}

func (s *Service) StopTarget(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if w, ok := s.workers[id]; ok {
		w.cancel()
		delete(s.workers, id)
		vlog.Info("memory monitor stopped", "id", id)
	}
}

func (s *Service) GetHistory(url string, since time.Time) *HistoryResponse {
	s.mu.RLock()
	td, ok := s.data[url]
	s.mu.RUnlock()

	if !ok {
		return &HistoryResponse{Points: []DataPoint{}, GCEvents: []GCEvent{}}
	}

	td.mu.RLock()
	defer td.mu.RUnlock()

	var points []DataPoint
	var gcEvents []GCEvent

	if since.IsZero() {
		points = make([]DataPoint, len(td.points))
		copy(points, td.points)
		gcEvents = make([]GCEvent, len(td.gcEvents))
		copy(gcEvents, td.gcEvents)
	} else {
		for _, p := range td.points {
			if p.Timestamp.After(since) {
				points = append(points, p)
			}
		}
		for _, e := range td.gcEvents {
			if e.Timestamp.After(since) {
				gcEvents = append(gcEvents, e)
			}
		}
	}

	if points == nil {
		points = []DataPoint{}
	}
	if gcEvents == nil {
		gcEvents = []GCEvent{}
	}

	return &HistoryResponse{Points: points, GCEvents: gcEvents}
}

func (s *Service) pollLoop(ctx context.Context, url string) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// Poll immediately on start
	s.pollOnce(url)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pollOnce(url)
		}
	}
}

func (s *Service) pollOnce(url string) {
	ms, err := FetchMemStats(s.client, url)
	if err != nil {
		return // silently skip failed polls
	}

	// Fetch goroutine count (best-effort, ignore errors)
	goroutineCount, _ := FetchGoroutineCount(s.client, url)

	point := DataPoint{
		Timestamp:     ms.Timestamp,
		HeapAlloc:     ms.HeapAlloc,
		HeapSys:       ms.HeapSys,
		Sys:           ms.Sys,
		NumGC:         ms.NumGC,
		PauseTotalNs:  ms.PauseTotalNs,
		LastPauseNs:   ms.LastPauseNs,
		NumGoroutines: goroutineCount,
	}

	s.mu.RLock()
	td := s.data[url]
	s.mu.RUnlock()

	if td == nil {
		return
	}

	td.mu.Lock()
	defer td.mu.Unlock()

	// Detect GC event
	if td.lastGC > 0 && ms.NumGC > td.lastGC {
		td.gcEvents = append(td.gcEvents, GCEvent{
			Timestamp: ms.Timestamp,
			PauseNs:   ms.LastPauseNs,
			GCNum:     ms.NumGC,
		})
		// Trim GC events to match data window
		if len(td.gcEvents) > MaxPoints {
			td.gcEvents = td.gcEvents[len(td.gcEvents)-MaxPoints:]
		}
	}
	td.lastGC = ms.NumGC

	// Append data point
	td.points = append(td.points, point)
	if len(td.points) > MaxPoints {
		td.points = td.points[len(td.points)-MaxPoints:]
	}
}
