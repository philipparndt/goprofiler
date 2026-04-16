package monitor

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type GoroutineGroup struct {
	Count    int    `json:"count"`
	State    string `json:"state"`
	TopFrame string `json:"topFrame"`
	Location string `json:"location"`
	Stack    string `json:"stack"`
}

type GoroutineGroupsResponse struct {
	Total  int              `json:"total"`
	Groups []GoroutineGroup `json:"groups"`
}

var goroutineHeaderRe = regexp.MustCompile(`^goroutine profile: total (\d+)`)
var groupHeaderRe = regexp.MustCompile(`^(\d+) @ `)

func FetchGoroutineCount(client *http.Client, baseURL string) (uint64, error) {
	resp, err := client.Get(baseURL + "/debug/pprof/goroutine?debug=1")
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	// Read just enough to get the first line
	buf := make([]byte, 256)
	n, _ := resp.Body.Read(buf)
	firstLine := strings.SplitN(string(buf[:n]), "\n", 2)[0]

	if matches := goroutineHeaderRe.FindStringSubmatch(firstLine); len(matches) > 1 {
		count, _ := strconv.ParseUint(matches[1], 10, 64)
		return count, nil
	}

	return 0, fmt.Errorf("unexpected goroutine profile format")
}

func FetchGoroutineGroups(client *http.Client, baseURL string, topN int) (*GoroutineGroupsResponse, error) {
	resp, err := client.Get(baseURL + "/debug/pprof/goroutine?debug=1")
	if err != nil {
		return nil, fmt.Errorf("fetch goroutine profile: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10MB limit
	if err != nil {
		return nil, fmt.Errorf("read goroutine profile: %w", err)
	}

	text := string(body)
	lines := strings.Split(text, "\n")

	total := 0
	if len(lines) > 0 {
		if matches := goroutineHeaderRe.FindStringSubmatch(lines[0]); len(matches) > 1 {
			total, _ = strconv.Atoi(matches[1])
		}
	}

	// Parse groups: each starts with "N @" line
	var groups []GoroutineGroup
	var current *GoroutineGroup
	var stackLines []string

	for i := 1; i < len(lines); i++ {
		line := lines[i]

		if matches := groupHeaderRe.FindStringSubmatch(line); len(matches) > 1 {
			// Save previous group
			if current != nil {
				current.Stack = strings.Join(stackLines, "\n")
				groups = append(groups, *current)
			}

			count, _ := strconv.Atoi(matches[1])
			current = &GoroutineGroup{Count: count}
			stackLines = nil
			continue
		}

		if current == nil {
			continue
		}

		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		stackLines = append(stackLines, line)

		// Extract state from first line like "#   0x1234  runtime.gopark+0x5f  .../proc.go:123"
		// Actually the format after "N @" is hex addresses, then stack frames
		// The first frame line starts with "#"
		if strings.HasPrefix(trimmed, "#") && current.TopFrame == "" {
			// Parse frame: "#\t0x1234\tpackage.Function+0x5f\t\t/path/file.go:123"
			parts := strings.Split(trimmed, "\t")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p == "#" || p == "" {
					continue
				}
				if strings.HasPrefix(p, "0x") {
					continue
				}
				if strings.Contains(p, "/") && strings.Contains(p, ".go:") {
					current.Location = p
				} else if current.TopFrame == "" {
					current.TopFrame = p
					// Extract state from function name hints
					if strings.Contains(p, "gopark") || strings.Contains(p, "sleep") {
						current.State = "waiting"
					} else if strings.Contains(p, "chanrecv") || strings.Contains(p, "chansend") {
						current.State = "chan wait"
					} else if strings.Contains(p, "select") {
						current.State = "select"
					} else if strings.Contains(p, "Lock") || strings.Contains(p, "Mutex") {
						current.State = "lock wait"
					} else if strings.Contains(p, "Read") || strings.Contains(p, "Write") || strings.Contains(p, "Accept") {
						current.State = "I/O wait"
					} else if strings.Contains(p, "netpoll") {
						current.State = "net I/O"
					} else {
						current.State = "running"
					}
				}
			}
		}
	}

	// Save last group
	if current != nil {
		current.Stack = strings.Join(stackLines, "\n")
		groups = append(groups, *current)
	}

	// Sort by count descending
	sort.Slice(groups, func(i, j int) bool {
		return groups[i].Count > groups[j].Count
	})

	if topN > 0 && len(groups) > topN {
		groups = groups[:topN]
	}

	return &GoroutineGroupsResponse{Total: total, Groups: groups}, nil
}
