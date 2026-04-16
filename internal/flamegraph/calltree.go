package flamegraph

import (
	"github.com/google/pprof/profile"
)

type CallTreeNode struct {
	Name         string          `json:"name"`
	Self         int64           `json:"self"`
	SelfFmt      string          `json:"selfFmt"`
	SelfPct      float64         `json:"selfPct"`
	Cum          int64           `json:"cum"`
	CumFmt       string          `json:"cumFmt"`
	CumPct       float64         `json:"cumPct"`
	Calls        int64           `json:"calls"` // number of profiler samples, not exact invocations
	AllocSelf    int64           `json:"allocSelf,omitempty"`
	AllocSelfFmt string          `json:"allocSelfFmt,omitempty"`
	AllocCum     int64           `json:"allocCum,omitempty"`
	AllocCumFmt  string          `json:"allocCumFmt,omitempty"`
	Children     []*CallTreeNode `json:"children,omitempty"`
}

func BuildCallTree(p *profile.Profile) *CallTreeNode {
	if len(p.Sample) == 0 {
		return &CallTreeNode{Name: "root"}
	}

	valueIdx := bestValueIndex(p)

	allocIdx := -1
	if len(p.SampleType) >= 4 {
		for i, st := range p.SampleType {
			if st.Type == "alloc_space" && st.Unit == "bytes" {
				allocIdx = i
				break
			}
		}
	}

	var total int64
	for _, s := range p.Sample {
		total += s.Value[valueIdx]
	}

	root := &CallTreeNode{Name: "root"}

	for _, sample := range p.Sample {
		value := sample.Value[valueIdx]
		allocValue := int64(0)
		if allocIdx >= 0 && allocIdx < len(sample.Value) {
			allocValue = sample.Value[allocIdx]
		}

		node := root
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
				child.AllocCum += allocValue
				child.Calls++
				node = child
			}
		}
		root.Cum += value
		root.AllocCum += allocValue
		root.Calls++
	}

	var allocSt *profile.ValueType
	if allocIdx >= 0 {
		allocSt = p.SampleType[allocIdx]
	}

	// Compute self values (cum - sum of children cum) and format strings
	computeSelf(root, total, p.SampleType[valueIdx], allocSt)

	return root
}

func computeSelf(node *CallTreeNode, total int64, st *profile.ValueType, allocSt *profile.ValueType) {
	var childrenCum int64
	var childrenAllocCum int64
	for _, c := range node.Children {
		childrenCum += c.Cum
		childrenAllocCum += c.AllocCum
		computeSelf(c, total, st, allocSt)
	}

	node.Self = node.Cum - childrenCum
	if node.Self < 0 {
		node.Self = 0
	}

	node.SelfFmt = formatValue(node.Self, st)
	node.SelfPct = pct(node.Self, total)
	node.CumFmt = formatValue(node.Cum, st)
	node.CumPct = pct(node.Cum, total)

	if allocSt != nil {
		node.AllocSelf = node.AllocCum - childrenAllocCum
		if node.AllocSelf < 0 {
			node.AllocSelf = 0
		}
		node.AllocSelfFmt = formatValue(node.AllocSelf, allocSt)
		node.AllocCumFmt = formatValue(node.AllocCum, allocSt)
	}
}
