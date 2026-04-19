package flamegraph

import (
	"fmt"
	"sort"

	"github.com/google/pprof/profile"
)

type Node struct {
	Name     string  `json:"name"`
	Value    int64   `json:"value"`
	Samples  int64   `json:"samples"`
	Children []*Node `json:"children,omitempty"`
}

type TopFunction struct {
	Name       string  `json:"name"`
	Flat       string  `json:"flat"`
	FlatPct    float64 `json:"flatPercent"`
	Cum        string  `json:"cum"`
	CumPct     float64 `json:"cumPercent"`
	AllocFlat  string  `json:"allocFlat,omitempty"`
	AllocFPct  float64 `json:"allocFlatPercent,omitempty"`
	AllocCum   string  `json:"allocCum,omitempty"`
	AllocCPct  float64 `json:"allocCumPercent,omitempty"`
}

type Result struct {
	FlameGraph   *Node         `json:"flameGraph"`
	TopFunctions []TopFunction `json:"topFunctions"`
}

// Convert converts a profile to a flame graph and top functions.
// Optional overrideIdx overrides the value index selection (pass -1 or omit for auto).
func Convert(p *profile.Profile, overrideIdx ...int) *Result {
	if len(p.Sample) == 0 {
		return &Result{
			FlameGraph: &Node{Name: "root", Value: 0},
		}
	}

	valueIdx := bestValueIndex(p)
	if len(overrideIdx) > 0 && overrideIdx[0] >= 0 && overrideIdx[0] < len(p.SampleType) {
		valueIdx = overrideIdx[0]
	}

	// Build flame graph tree
	root := &Node{Name: "root"}
	for _, sample := range p.Sample {
		value := sample.Value[valueIdx]
		if value == 0 {
			continue
		}

		node := root
		// Walk locations in reverse (root to leaf)
		for i := len(sample.Location) - 1; i >= 0; i-- {
			loc := sample.Location[i]
			for j := len(loc.Line) - 1; j >= 0; j-- {
				line := loc.Line[j]
				name := ""
				if line.Function != nil {
					name = line.Function.Name
				} else {
					name = "<unknown>"
				}

				var child *Node
				for _, c := range node.Children {
					if c.Name == name {
						child = c
						break
					}
				}
				if child == nil {
					child = &Node{Name: name}
					node.Children = append(node.Children, child)
				}
				child.Value += value
				child.Samples++
				node = child
			}
		}
		root.Value += value
		root.Samples++
	}

	// Find alloc_space index for heap profiles (to show both inuse and alloc)
	allocIdx := -1
	if len(p.SampleType) >= 4 {
		for i, st := range p.SampleType {
			if st.Type == "alloc_space" && st.Unit == "bytes" {
				allocIdx = i
				break
			}
		}
	}

	// Build top functions table
	type funcStats struct {
		flat      int64
		cum       int64
		allocFlat int64
		allocCum  int64
	}
	statsMap := make(map[string]*funcStats)

	for _, sample := range p.Sample {
		value := sample.Value[valueIdx]
		allocValue := int64(0)
		if allocIdx >= 0 && allocIdx < len(sample.Value) {
			allocValue = sample.Value[allocIdx]
		}

		seen := make(map[string]bool)
		for i, loc := range sample.Location {
			for _, line := range loc.Line {
				name := ""
				if line.Function != nil {
					name = line.Function.Name
				}
				if name == "" {
					continue
				}

				fs, ok := statsMap[name]
				if !ok {
					fs = &funcStats{}
					statsMap[name] = fs
				}

				if !seen[name] {
					fs.cum += value
					fs.allocCum += allocValue
					seen[name] = true
				}

				if i == 0 {
					fs.flat += value
					fs.allocFlat += allocValue
				}
			}
		}
	}

	var total int64
	var allocTotal int64
	for _, s := range p.Sample {
		total += s.Value[valueIdx]
		if allocIdx >= 0 && allocIdx < len(s.Value) {
			allocTotal += s.Value[allocIdx]
		}
	}

	var topFuncs []TopFunction
	for name, fs := range statsMap {
		tf := TopFunction{
			Name:    name,
			Flat:    formatValue(fs.flat, p.SampleType[valueIdx]),
			FlatPct: pct(fs.flat, total),
			Cum:     formatValue(fs.cum, p.SampleType[valueIdx]),
			CumPct:  pct(fs.cum, total),
		}
		if allocIdx >= 0 {
			tf.AllocFlat = formatValue(fs.allocFlat, p.SampleType[allocIdx])
			tf.AllocFPct = pct(fs.allocFlat, allocTotal)
			tf.AllocCum = formatValue(fs.allocCum, p.SampleType[allocIdx])
			tf.AllocCPct = pct(fs.allocCum, allocTotal)
		}
		topFuncs = append(topFuncs, tf)
	}

	sort.Slice(topFuncs, func(i, j int) bool {
		return topFuncs[i].CumPct > topFuncs[j].CumPct
	})

	return &Result{
		FlameGraph:   root,
		TopFunctions: topFuncs,
	}
}

// bestValueIndex picks the most meaningful value type from a pprof profile.
// CPU profiles have [samples, cpu_nanoseconds] -- prefer cpu (index 1).
// Heap profiles have [alloc_objects, alloc_space, inuse_objects, inuse_space] -- prefer inuse_space (index 3).
// Allocs profiles: same layout but prefer alloc_space (index 1).
// Falls back to 0 if only one value type exists.
func bestValueIndex(p *profile.Profile) int {
	if len(p.SampleType) <= 1 {
		return 0
	}

	// For heap-like profiles (4 value types): prefer inuse_space (current live memory)
	if len(p.SampleType) >= 4 {
		for i, st := range p.SampleType {
			if st.Type == "inuse_space" && st.Unit == "bytes" {
				return i
			}
		}
	}

	// Prefer time or bytes over counts
	for i, st := range p.SampleType {
		switch st.Unit {
		case "nanoseconds", "bytes":
			return i
		}
	}
	return 0
}

func pct(v, total int64) float64 {
	if total == 0 {
		return 0
	}
	return float64(v) / float64(total) * 100
}

func formatValue(v int64, st *profile.ValueType) string {
	unit := st.Unit
	switch unit {
	case "nanoseconds":
		if v >= 1e9 {
			return fmt.Sprintf("%.2fs", float64(v)/1e9)
		} else if v >= 1e6 {
			return fmt.Sprintf("%.1fms", float64(v)/1e6)
		} else if v >= 1e3 {
			return fmt.Sprintf("%.1fus", float64(v)/1e3)
		}
		return fmt.Sprintf("%dns", v)
	case "bytes":
		if v >= 1<<30 {
			return fmt.Sprintf("%.1f GB", float64(v)/(1<<30))
		} else if v >= 1<<20 {
			return fmt.Sprintf("%.1f MB", float64(v)/(1<<20))
		} else if v >= 1<<10 {
			return fmt.Sprintf("%.1f KB", float64(v)/(1<<10))
		}
		return fmt.Sprintf("%d B", v)
	default:
		return fmt.Sprintf("%d", v)
	}
}
