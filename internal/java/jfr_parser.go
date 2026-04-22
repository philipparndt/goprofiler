package java

import (
	"fmt"
	"io"
	"sort"

	jfrparser "github.com/grafana/jfr-parser/parser"
	"github.com/grafana/jfr-parser/parser/types"
	"github.com/philipparndt/goprofiler/internal/flamegraph"
)

// JFRProfileType indicates which events to extract from a JFR recording.
type JFRProfileType string

const (
	JFRProfileCPU   JFRProfileType = "cpu"
	JFRProfileAlloc JFRProfileType = "alloc"
	JFRProfileLock  JFRProfileType = "lock"
)

// ParseJFR parses a JFR recording and converts it to a flame graph result.
type stackEntry struct {
	stack []string
	value int64
}

func ParseJFR(data []byte, profileType JFRProfileType) (*flamegraph.Result, error) {
	p := jfrparser.NewParser(data, jfrparser.Options{SymbolProcessor: jfrparser.ProcessSymbols})
	var entries []stackEntry
	var allocSamples []stackEntry // fallback for alloc when no TLAB events
	hasTLAB := false

	for {
		typ, err := p.ParseEvent()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse JFR event: %w", err)
		}

		switch profileType {
		case JFRProfileCPU:
			if typ == p.TypeMap.T_EXECUTION_SAMPLE {
				stack := resolveStack(p, p.ExecutionSample.StackTrace)
				if len(stack) > 0 {
					entries = append(entries, stackEntry{stack: stack, value: 1})
				}
			}
		case JFRProfileAlloc:
			if typ == p.TypeMap.T_ALLOC_IN_NEW_TLAB {
				stack := resolveStack(p, p.ObjectAllocationInNewTLAB.StackTrace)
				value := int64(p.ObjectAllocationInNewTLAB.TlabSize)
				if len(stack) > 0 {
					hasTLAB = true
					entries = append(entries, stackEntry{stack: stack, value: value})
				}
			} else if typ == p.TypeMap.T_ALLOC_OUTSIDE_TLAB {
				stack := resolveStack(p, p.ObjectAllocationOutsideTLAB.StackTrace)
				value := int64(p.ObjectAllocationOutsideTLAB.AllocationSize)
				if len(stack) > 0 {
					hasTLAB = true
					entries = append(entries, stackEntry{stack: stack, value: value})
				}
			} else if typ == p.TypeMap.T_ALLOC_SAMPLE {
				stack := resolveStack(p, p.ObjectAllocationSample.StackTrace)
				weight := p.ObjectAllocationSample.Weight
				if len(stack) > 0 {
					allocSamples = append(allocSamples, stackEntry{stack: stack, value: int64(weight)})
				}
			}
		case JFRProfileLock:
			if typ == p.TypeMap.T_MONITOR_ENTER {
				stack := resolveStack(p, p.JavaMonitorEnter.StackTrace)
				value := int64(p.JavaMonitorEnter.Duration)
				if len(stack) > 0 {
					entries = append(entries, stackEntry{stack: stack, value: value})
				}
			} else if typ == p.TypeMap.T_THREAD_PARK {
				stack := resolveStack(p, p.ThreadPark.StackTrace)
				value := int64(p.ThreadPark.Duration)
				if len(stack) > 0 {
					entries = append(entries, stackEntry{stack: stack, value: value})
				}
			}
		}
	}

	// For alloc profiling: use TLAB events if available (reliable byte sizes).
	// For ObjectAllocationSample (JDK 16+), the Weight field can have parser
	// glitches producing extreme outliers. Cap at P95 to remove them.
	if profileType == JFRProfileAlloc && !hasTLAB && len(allocSamples) > 0 {
		entries = sanitizeAllocWeights(allocSamples)
	}

	// Build flame graph from collected stacks
	root := &flamegraph.Node{Name: "root"}
	for _, e := range entries {
		node := root
		// Walk stack from root to leaf (reverse order since JFR stacks are leaf-first)
		for i := len(e.stack) - 1; i >= 0; i-- {
			name := e.stack[i]
			var child *flamegraph.Node
			for _, c := range node.Children {
				if c.Name == name {
					child = c
					break
				}
			}
			if child == nil {
				child = &flamegraph.Node{Name: name}
				node.Children = append(node.Children, child)
			}
			child.Value += e.value
			child.Samples++
			node = child
		}
		root.Value += e.value
		root.Samples++
	}

	// Build top functions from the stacks
	type funcStats struct {
		flat int64
		cum  int64
	}
	statsMap := make(map[string]*funcStats)
	for _, e := range entries {
		seen := make(map[string]bool)
		for i, name := range e.stack {
			fs, ok := statsMap[name]
			if !ok {
				fs = &funcStats{}
				statsMap[name] = fs
			}
			if !seen[name] {
				fs.cum += e.value
				seen[name] = true
			}
			if i == 0 { // leaf frame = flat
				fs.flat += e.value
			}
		}
	}

	var total int64
	for _, e := range entries {
		total += e.value
	}

	var topFuncs []flamegraph.TopFunction
	for name, fs := range statsMap {
		topFuncs = append(topFuncs, flamegraph.TopFunction{
			Name:    name,
			Flat:    FormatJFRValue(fs.flat, profileType),
			FlatPct: pct(fs.flat, total),
			Cum:     FormatJFRValue(fs.cum, profileType),
			CumPct:  pct(fs.cum, total),
		})
	}

	// Sort by cumulative descending
	sortTopFunctions(topFuncs)

	return &flamegraph.Result{
		FlameGraph:   root,
		TopFunctions: topFuncs,
	}, nil
}

// sanitizeAllocWeights removes extreme outliers from ObjectAllocationSample
// weights. The Grafana JFR parser occasionally misinterprets fields, producing
// values orders of magnitude larger than the rest. We cap at 10x the median.
func sanitizeAllocWeights(samples []stackEntry) []stackEntry {
	if len(samples) == 0 {
		return samples
	}

	// Collect all weights and sort to find median
	weights := make([]int64, len(samples))
	for i, s := range samples {
		weights[i] = s.value
	}
	sort.Slice(weights, func(i, j int) bool { return weights[i] < weights[j] })

	median := weights[len(weights)/2]
	if median <= 0 {
		median = 1
	}
	cap := median * 10 // anything > 10x median is an outlier

	result := make([]stackEntry, len(samples))
	for i, s := range samples {
		v := s.value
		if v > cap {
			v = cap // clamp to cap instead of discarding
		}
		if v <= 0 {
			v = 1
		}
		result[i] = stackEntry{stack: s.stack, value: v}
	}
	return result
}

func resolveStack(p *jfrparser.Parser, ref types.StackTraceRef) []string {
	st := p.GetStacktrace(ref)
	if st == nil {
		return nil
	}
	frames := make([]string, 0, len(st.Frames))
	for _, f := range st.Frames {
		method := p.GetMethod(f.Method)
		if method == nil {
			continue
		}
		className := ""
		cls := p.GetClass(method.Type)
		if cls != nil {
			className = p.GetSymbolString(cls.Name)
		}
		methodName := p.GetSymbolString(method.Name)
		if className != "" {
			frames = append(frames, className+"."+methodName)
		} else {
			frames = append(frames, methodName)
		}
	}
	return frames
}

func FormatJFRValue(v int64, profileType JFRProfileType) string {
	switch profileType {
	case JFRProfileAlloc:
		if v >= 1<<30 {
			return fmt.Sprintf("%.1f GB", float64(v)/float64(1<<30))
		} else if v >= 1<<20 {
			return fmt.Sprintf("%.1f MB", float64(v)/float64(1<<20))
		} else if v >= 1<<10 {
			return fmt.Sprintf("%.1f KB", float64(v)/float64(1<<10))
		}
		return fmt.Sprintf("%d B", v)
	case JFRProfileLock:
		if v >= 1e9 {
			return fmt.Sprintf("%.2fs", float64(v)/1e9)
		} else if v >= 1e6 {
			return fmt.Sprintf("%.1fms", float64(v)/1e6)
		}
		return fmt.Sprintf("%.1fus", float64(v)/1e3)
	default: // CPU samples
		return fmt.Sprintf("%d samples", v)
	}
}

func pct(v, total int64) float64 {
	if total == 0 {
		return 0
	}
	return float64(v) / float64(total) * 100
}

func sortTopFunctions(funcs []flamegraph.TopFunction) {
	for i := 1; i < len(funcs); i++ {
		for j := i; j > 0 && funcs[j].CumPct > funcs[j-1].CumPct; j-- {
			funcs[j], funcs[j-1] = funcs[j-1], funcs[j]
		}
	}
}
