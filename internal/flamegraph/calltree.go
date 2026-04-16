package flamegraph

import (
	"github.com/google/pprof/profile"
)

type CallTreeNode struct {
	Name     string          `json:"name"`
	Self     int64           `json:"self"`
	SelfFmt  string          `json:"selfFmt"`
	SelfPct  float64         `json:"selfPct"`
	Cum      int64           `json:"cum"`
	CumFmt   string          `json:"cumFmt"`
	CumPct   float64         `json:"cumPct"`
	Calls    int64           `json:"calls"` // number of profiler samples, not exact invocations
	Children []*CallTreeNode `json:"children,omitempty"`
}

func BuildCallTree(p *profile.Profile) *CallTreeNode {
	if len(p.Sample) == 0 {
		return &CallTreeNode{Name: "root"}
	}

	valueIdx := bestValueIndex(p)

	var total int64
	for _, s := range p.Sample {
		total += s.Value[valueIdx]
	}

	root := &CallTreeNode{Name: "root"}

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
				name := "<unknown>"
				if line.Function != nil {
					name = line.Function.Name
				}

				var child *CallTreeNode
				for _, c := range node.Children {
					if c.Name == name {
						child = c
						break
					}
				}
				if child == nil {
					child = &CallTreeNode{Name: name}
					node.Children = append(node.Children, child)
				}
				child.Cum += value
				child.Calls++
				node = child
			}
		}
		root.Cum += value
		root.Calls++
	}

	// Compute self values (cum - sum of children cum) and format strings
	computeSelf(root, total, p.SampleType[valueIdx])

	return root
}

func computeSelf(node *CallTreeNode, total int64, st *profile.ValueType) {
	var childrenCum int64
	for _, c := range node.Children {
		childrenCum += c.Cum
		computeSelf(c, total, st)
	}

	node.Self = node.Cum - childrenCum
	if node.Self < 0 {
		node.Self = 0
	}

	node.SelfFmt = formatValue(node.Self, st)
	node.SelfPct = pct(node.Self, total)
	node.CumFmt = formatValue(node.Cum, st)
	node.CumPct = pct(node.Cum, total)
}
