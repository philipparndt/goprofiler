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

// profileLineRe matches table rows like:
// <tr><td>561</td><td><a href='allocs?debug=1'>allocs</a></td></tr>
// Also matches older format: <a href="goroutine?debug=1">goroutine</a> (123)
var tableRowRe = regexp.MustCompile(`<td>(\d+)</td><td><a href=['"][^'"]*['"]>([^<]+)</a>`)
var linkOnlyRe = regexp.MustCompile(`<a href=['"][^'"]*['"]>([^<]+)</a>(?:\s*\((\d+)\))?`)

func ParsePprofIndex(html string) []DiscoveredProfile {
	var profiles []DiscoveredProfile
	seen := make(map[string]bool)

	addProfile := func(name string, count *int) {
		name = strings.TrimSpace(name)

		if name == "profile" {
			name = "cpu"
		}

		if name == "cmdline" || name == "symbol" {
			return
		}

		if seen[name] {
			return
		}
		seen[name] = true

		dp := DiscoveredProfile{
			Name:  name,
			Kind:  "snapshot",
			Count: count,
		}

		if name == "cpu" || name == "trace" {
			dp.Kind = "recording"
		}

		profiles = append(profiles, dp)
	}

	// Try table format first: <tr><td>COUNT</td><td><a href='...'>NAME</a></td></tr>
	tableMatches := tableRowRe.FindAllStringSubmatch(html, -1)
	if len(tableMatches) > 0 {
		for _, match := range tableMatches {
			count, _ := strconv.Atoi(match[1])
			addProfile(match[2], &count)
		}
	} else {
		// Fallback: <a href="...">NAME</a> (COUNT)
		for _, match := range linkOnlyRe.FindAllStringSubmatch(html, -1) {
			var count *int
			if match[2] != "" {
				c, _ := strconv.Atoi(match[2])
				count = &c
			}
			addProfile(match[1], count)
		}
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
