package profiler

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type DiscoveredProfile struct {
	Name  string `json:"name"`
	Count *int   `json:"count,omitempty"`
	Kind  string `json:"kind"` // "recording" or "snapshot"
}

// profileLineRe matches lines like:
// <a href="goroutine?debug=1">goroutine</a> (123)
// <a href="/debug/pprof/heap?debug=1">heap</a>
var profileLineRe = regexp.MustCompile(`<a href="[^"]*">([^<]+)</a>(?:\s*\((\d+)\))?`)

func ParsePprofIndex(html string) []DiscoveredProfile {
	var profiles []DiscoveredProfile
	seen := make(map[string]bool)

	for _, match := range profileLineRe.FindAllStringSubmatch(html, -1) {
		name := strings.TrimSpace(match[1])

		// Normalize "profile" to "cpu"
		if name == "profile" {
			name = "cpu"
		}

		// Skip entries we handle specially or that aren't useful
		if name == "cmdline" || name == "symbol" || name == "trace" {
			continue
		}

		if seen[name] {
			continue
		}
		seen[name] = true

		dp := DiscoveredProfile{
			Name: name,
			Kind: "snapshot",
		}

		if name == "cpu" {
			dp.Kind = "recording"
		}

		if match[2] != "" {
			if count, err := strconv.Atoi(match[2]); err == nil {
				dp.Count = &count
			}
		}

		profiles = append(profiles, dp)
	}

	// Also add trace as a recording type
	if !seen["trace"] {
		profiles = append(profiles, DiscoveredProfile{Name: "trace", Kind: "recording"})
	}

	return profiles
}

func FetchAvailableProfiles(ctx context.Context, baseURL string) ([]DiscoveredProfile, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/debug/pprof/", nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch pprof index: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pprof index returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read pprof index: %w", err)
	}

	return ParsePprofIndex(string(body)), nil
}
