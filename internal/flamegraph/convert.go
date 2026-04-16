package flamegraph

import (
	"fmt"
	"sort"

	"github.com/google/pprof/profile"
)

type Node struct {
	Name     string  `json:"name"`
	Value    int64   `json:"value"`
	Children []*Node `json:"children,omitempty"`
}

type TopFunction struct {
	Name    string  `json:"name"`
	Flat    string  `json:"flat"`
	FlatPct float64 `json:"flatPercent"`
	Cum     string  `json:"cum"`
	CumPct  float64 `json:"cumPercent"`
}

type Result struct {
	FlameGraph   *Node         `json:"flameGraph"`
	TopFunctions []TopFunction `json:"topFunctions"`
}

func Convert(p *profile.Profile) *Result {
	if len(p.Sample) == 0 {
		return &Result{
			FlameGraph: &Node{Name: "root", Value: 0},
		}
	}

	valueIdx := bestValueIndex(p)

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
				node = child
			}
		}
		root.Value += value
	}

	// Build top functions table
	type funcStats struct {
		name string
		flat int64
		cum  int64
	}
	flatMap := make(map[string]*funcStats)
	cumMap := make(map[string]int64)

	for _, sample := range p.Sample {
		value := sample.Value[valueIdx]
		if value == 0 {
			continue
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

				if !seen[name] {
					cumMap[name] += value
					seen[name] = true
				}

				// Flat = leaf only (first location, first line)
				if i == 0 {
					if _, ok := flatMap[name]; !ok {
						flatMap[name] = &funcStats{name: name}
					}
					flatMap[name].flat += value
				}
			}
		}
	}

	var total int64
	for _, s := range p.Sample {
		total += s.Value[valueIdx]
	}

	var topFuncs []TopFunction
	for name, cum := range cumMap {
		flat := int64(0)
		if fs, ok := flatMap[name]; ok {
			flat = fs.flat
		}
		topFuncs = append(topFuncs, TopFunction{
			Name:    name,
			Flat:    formatValue(flat, p.SampleType[valueIdx]),
			FlatPct: pct(flat, total),
			Cum:     formatValue(cum, p.SampleType[valueIdx]),
			CumPct:  pct(cum, total),
		})
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
// Heap profiles have [alloc_objects, alloc_space, ...] -- prefer bytes (alloc_space, index 1).
// Falls back to 0 if only one value type exists.
func bestValueIndex(p *profile.Profile) int {
	if len(p.SampleType) <= 1 {
		return 0
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
