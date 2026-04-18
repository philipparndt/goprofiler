package profiler

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/philipparndt/go-logger"
)

type ProfileType string

const (
	CPU          ProfileType = "cpu"
	Heap         ProfileType = "heap"
	Goroutine    ProfileType = "goroutine"
	Block        ProfileType = "block"
	Mutex        ProfileType = "mutex"
	Allocs       ProfileType = "allocs"
	ThreadCreate ProfileType = "threadcreate"
	Trace        ProfileType = "trace"
)

type CollectedProfile struct {
	Type        ProfileType
	TargetURL   string
	Data        []byte
	Timestamp   time.Time
	DurationSec int
}

type Collector struct {
	client *http.Client
}

func NewCollector() *Collector {
	return &Collector{
		client: &http.Client{
			Timeout: 5 * time.Minute, // Long timeout for CPU profiles
		},
	}
}

func (c *Collector) CollectCPU(ctx context.Context, baseURL string, durationSec int) (*CollectedProfile, error) {
	if durationSec <= 0 {
		durationSec = 30
	}

	url := fmt.Sprintf("%s/debug/pprof/profile?seconds=%d", baseURL, durationSec)
	logger.Info("starting CPU profile", "url", baseURL, "duration", durationSec)

	data, err := c.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("CPU profile collection failed: %w", err)
	}

	return &CollectedProfile{
		Type:        CPU,
		TargetURL:   baseURL,
		Data:        data,
		Timestamp:   time.Now(),
		DurationSec: durationSec,
	}, nil
}

func (c *Collector) CollectTrace(ctx context.Context, baseURL string, durationSec int) (*CollectedProfile, error) {
	if durationSec <= 0 {
		durationSec = 5
	}

	url := fmt.Sprintf("%s/debug/pprof/trace?seconds=%d", baseURL, durationSec)
	logger.Info("starting execution trace", "url", baseURL, "duration", durationSec)

	data, err := c.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("trace collection failed: %w", err)
	}

	return &CollectedProfile{
		Type:        Trace,
		TargetURL:   baseURL,
		Data:        data,
		Timestamp:   time.Now(),
		DurationSec: durationSec,
	}, nil
}

func (c *Collector) CollectSnapshot(ctx context.Context, baseURL string, ptype ProfileType) (*CollectedProfile, error) {
	var endpoint string
	switch ptype {
	case Heap:
		endpoint = "/debug/pprof/heap"
	case Goroutine:
		endpoint = "/debug/pprof/goroutine?debug=0"
	case Block:
		endpoint = "/debug/pprof/block"
	case Mutex:
		endpoint = "/debug/pprof/mutex"
	case Allocs:
		endpoint = "/debug/pprof/allocs"
	case ThreadCreate:
		endpoint = "/debug/pprof/threadcreate"
	default:
		return nil, fmt.Errorf("unsupported snapshot type: %s", ptype)
	}

	url := baseURL + endpoint
	logger.Info("collecting snapshot profile", "type", ptype, "url", baseURL)

	data, err := c.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("%s profile collection failed: %w", ptype, err)
	}

	return &CollectedProfile{
		Type:      ptype,
		TargetURL: baseURL,
		Data:      data,
		Timestamp: time.Now(),
	}, nil
}

func (c *Collector) fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
}
