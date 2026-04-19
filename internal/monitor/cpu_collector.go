package monitor

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/philipparndt/go-logger"
)

const (
	CpuPollInterval   = 5 * time.Second
	CpuSampleDuration = 1 // seconds
)

type CpuDataPoint struct {
	Timestamp  time.Time `json:"timestamp"`
	CpuPercent float64   `json:"cpuPercent"`
}

type CpuHistoryResponse struct {
	Points []CpuDataPoint `json:"points"`
}

type cpuTargetData struct {
	mu     sync.RWMutex
	points []CpuDataPoint
}

type cpuTargetWorker struct {
	cancel context.CancelFunc
}

type CpuService struct {
	mu      sync.RWMutex
	data    map[string]*cpuTargetData   // keyed by URL
	workers map[string]*cpuTargetWorker // keyed by target ID
	urls    map[string]string           // target ID -> URL
	client  *http.Client
}

func NewCpuService() *CpuService {
	return &CpuService{
		data:    make(map[string]*cpuTargetData),
		workers: make(map[string]*cpuTargetWorker),
		urls:    make(map[string]string),
		client:  &http.Client{Timeout: 30 * time.Second}, // longer timeout for CPU profiling
	}
}

func (s *CpuService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, w := range s.workers {
		w.cancel()
		delete(s.workers, id)
	}
}

func (s *CpuService) StartTarget(id, url string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Stop existing worker if any
	if w, ok := s.workers[id]; ok {
		w.cancel()
		delete(s.workers, id)
	}

	// Ensure data buffer exists for this URL
	if _, ok := s.data[url]; !ok {
		s.data[url] = &cpuTargetData{}
	}

	s.urls[id] = url

	ctx, cancel := context.WithCancel(context.Background())
	s.workers[id] = &cpuTargetWorker{cancel: cancel}

	logger.Info("cpu monitor started", "id", id, "url", url)
	go s.pollLoop(ctx, url)
}

func (s *CpuService) StopTarget(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if w, ok := s.workers[id]; ok {
		w.cancel()
		delete(s.workers, id)
		delete(s.urls, id)
		logger.Info("cpu monitor stopped", "id", id)
	}
}

func (s *CpuService) IsActive(id string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.workers[id]
	return ok
}

func (s *CpuService) GetHistory(url string, since time.Time) *CpuHistoryResponse {
	s.mu.RLock()
	td, ok := s.data[url]
	s.mu.RUnlock()

	if !ok {
		return &CpuHistoryResponse{Points: []CpuDataPoint{}}
	}

	td.mu.RLock()
	defer td.mu.RUnlock()

	var points []CpuDataPoint

	if since.IsZero() {
		points = make([]CpuDataPoint, len(td.points))
		copy(points, td.points)
	} else {
		for _, p := range td.points {
			if p.Timestamp.After(since) {
				points = append(points, p)
			}
		}
	}

	if points == nil {
		points = []CpuDataPoint{}
	}

	return &CpuHistoryResponse{Points: points}
}

func (s *CpuService) pollLoop(ctx context.Context, url string) {
	// Poll immediately on start
	s.pollOnce(url)

	ticker := time.NewTicker(CpuPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pollOnce(url)
		}
	}
}

func (s *CpuService) pollOnce(url string) {
	stats, err := FetchCpuProfile(s.client, url, CpuSampleDuration)
	if err != nil {
		return // silently skip failed polls
	}

	point := CpuDataPoint{
		Timestamp:  stats.Timestamp,
		CpuPercent: stats.CpuPercent,
	}

	s.mu.RLock()
	td := s.data[url]
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
