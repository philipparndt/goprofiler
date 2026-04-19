package java

import (
	"fmt"
	"os/exec"
	"sort"
	"strconv"
	"strings"
)

// HeapClassInfo represents one row from jcmd GC.class_histogram.
type HeapClassInfo struct {
	Rank      int    `json:"rank"`
	Instances int64  `json:"instances"`
	Bytes     int64  `json:"bytes"`
	ClassName string `json:"className"`
}

// HeapHistogram represents the result of a live heap class histogram.
type HeapHistogram struct {
	Classes      []HeapClassInfo `json:"classes"`
	TotalInstances int64        `json:"totalInstances"`
	TotalBytes     int64        `json:"totalBytes"`
}

// CaptureHeapHistogram runs jcmd GC.class_histogram on a local JVM.
// This shows LIVE objects (after GC), equivalent to Go's heap inuse profile.
func CaptureHeapHistogram(pid int) (*HeapHistogram, error) {
	cmd := exec.Command("jcmd", strconv.Itoa(pid), "GC.class_histogram")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("jcmd GC.class_histogram failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return parseClassHistogram(string(out))
}

func parseClassHistogram(output string) (*HeapHistogram, error) {
	hist := &HeapHistogram{}
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "---") || strings.HasPrefix(line, "num") {
			continue
		}

		// Check for total line
		if strings.HasPrefix(line, "Total") {
			fields := strings.Fields(line)
			if len(fields) >= 3 {
				hist.TotalInstances, _ = strconv.ParseInt(fields[1], 10, 64)
				hist.TotalBytes, _ = strconv.ParseInt(fields[2], 10, 64)
			}
			continue
		}

		// Parse: "rank: instances bytes className"
		// Format: "   1:        12345    6789012 java.lang.String"
		// Remove the colon after rank number
		line = strings.Replace(line, ":", " ", 1)
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		rank, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		instances, _ := strconv.ParseInt(fields[1], 10, 64)
		bytes, _ := strconv.ParseInt(fields[2], 10, 64)
		className := fields[3]

		// Clean up array notation: [B -> byte[], [Ljava.lang.String; -> String[]
		className = cleanClassName(className)

		hist.Classes = append(hist.Classes, HeapClassInfo{
			Rank:      rank,
			Instances: instances,
			Bytes:     bytes,
			ClassName: className,
		})
	}

	// Sort by bytes descending
	sort.Slice(hist.Classes, func(i, j int) bool {
		return hist.Classes[i].Bytes > hist.Classes[j].Bytes
	})

	return hist, nil
}

func cleanClassName(name string) string {
	// JVM internal array representations
	switch {
	case name == "[B":
		return "byte[]"
	case name == "[C":
		return "char[]"
	case name == "[I":
		return "int[]"
	case name == "[J":
		return "long[]"
	case name == "[D":
		return "double[]"
	case name == "[F":
		return "float[]"
	case name == "[S":
		return "short[]"
	case name == "[Z":
		return "boolean[]"
	case strings.HasPrefix(name, "[L") && strings.HasSuffix(name, ";"):
		return strings.TrimPrefix(strings.TrimSuffix(name, ";"), "[L") + "[]"
	default:
		return name
	}
}
