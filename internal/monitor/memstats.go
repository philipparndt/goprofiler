package monitor

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type MemStats struct {
	Timestamp    time.Time `json:"timestamp"`
	HeapAlloc    uint64    `json:"heapAlloc"`
	HeapSys      uint64    `json:"heapSys"`
	Sys          uint64    `json:"sys"`
	NumGC        uint64    `json:"numGC"`
	PauseTotalNs uint64    `json:"pauseTotalNs"`
	LastPauseNs  uint64    `json:"lastPauseNs"`
	LastGC       time.Time `json:"lastGC"`
}

func FetchMemStats(client *http.Client, baseURL string) (*MemStats, error) {
	resp, err := client.Get(baseURL + "/debug/pprof/heap?debug=1")
	if err != nil {
		return nil, fmt.Errorf("fetch heap debug: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("heap debug returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	return parseMemStats(string(body))
}

func parseMemStats(text string) (*MemStats, error) {
	ms := &MemStats{Timestamp: time.Now()}

	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "# ") {
			continue
		}
		line = strings.TrimPrefix(line, "# ")

		parts := strings.SplitN(line, " = ", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		valStr := strings.TrimSpace(parts[1])
		val, err := strconv.ParseUint(valStr, 10, 64)
		if err != nil {
			continue
		}

		switch key {
		case "HeapAlloc":
			ms.HeapAlloc = val
		case "HeapSys":
			ms.HeapSys = val
		case "Sys":
			ms.Sys = val
		case "NumGC":
			ms.NumGC = val
		case "PauseTotalNs":
			ms.PauseTotalNs = val
		case "LastGC":
			ms.LastGC = time.Unix(0, int64(val))
		}
	}

	// Extract last pause from PauseNs array (parse the first element)
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# PauseNs = [") {
			inner := strings.TrimPrefix(line, "# PauseNs = [")
			inner = strings.TrimSuffix(inner, "]")
			parts := strings.Fields(inner)
			if len(parts) > 0 {
				if v, err := strconv.ParseUint(parts[0], 10, 64); err == nil {
					ms.LastPauseNs = v
				}
			}
			break
		}
	}

	return ms, nil
}
