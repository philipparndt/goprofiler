package monitor

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/pprof/profile"
)

type CpuStats struct {
	Timestamp  time.Time `json:"timestamp"`
	CpuPercent float64   `json:"cpuPercent"`
}

func FetchCpuProfile(client *http.Client, baseURL string, durationSec int) (*CpuStats, error) {
	url := fmt.Sprintf("%s/debug/pprof/profile?seconds=%d", baseURL, durationSec)
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch cpu profile: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cpu profile returned status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	prof, err := profile.ParseData(data)
	if err != nil {
		return nil, fmt.Errorf("parse profile: %w", err)
	}

	cpuPercent := computeCpuPercent(prof, durationSec)

	return &CpuStats{
		Timestamp:  time.Now(),
		CpuPercent: cpuPercent,
	}, nil
}

func computeCpuPercent(prof *profile.Profile, durationSec int) float64 {
	if prof.DurationNanos == 0 && durationSec == 0 {
		return 0
	}

	// Sum all sample values for the CPU time value type (usually index 1: "cpu" nanoseconds)
	valueIdx := 0
	for i, st := range prof.SampleType {
		if st.Unit == "nanoseconds" {
			valueIdx = i
			break
		}
	}

	var totalNanos int64
	for _, s := range prof.Sample {
		if valueIdx < len(s.Value) {
			totalNanos += s.Value[valueIdx]
		}
	}

	// Use profile's own duration if available, otherwise fall back to requested duration
	var wallNanos int64
	if prof.DurationNanos > 0 {
		wallNanos = prof.DurationNanos
	} else {
		wallNanos = int64(durationSec) * 1e9
	}

	if wallNanos == 0 {
		return 0
	}

	return (float64(totalNanos) / float64(wallNanos)) * 100.0
}
