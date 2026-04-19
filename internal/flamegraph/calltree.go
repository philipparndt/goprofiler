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

// BuildCallTree builds a call tree from a profile.
// Optional overrideIdx overrides the value index selection (pass -1 or omit for auto).
func BuildCallTree(p *profile.Profile, overrideIdx ...int) *CallTreeNode {
	if len(p.Sample) == 0 {
		return &CallTreeNode{Name: "root"}
	}

	valueIdx := bestValueIndex(p)
	if len(overrideIdx) > 0 && overrideIdx[0] >= 0 && overrideIdx[0] < len(p.SampleType) {
		valueIdx = overrideIdx[0]
	}

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

// BuildCallTreeFromFlameGraph builds a call tree from a FlameNode tree.
// Used for JFR and other non-pprof profiles.
func BuildCallTreeFromFlameGraph(root *Node, formatFn func(int64) string) *CallTreeNode {
	if root == nil {
		return &CallTreeNode{Name: "root"}
	}
	total := root.Value
	ct := convertFlameNode(root, total, formatFn)
	return ct
}

func convertFlameNode(n *Node, total int64, formatFn func(int64) string) *CallTreeNode {
	ct := &CallTreeNode{
		Name:    n.Name,
		Cum:     n.Value,
		Calls:   n.Samples,
	}
	for _, c := range n.Children {
		ct.Children = append(ct.Children, convertFlameNode(c, total, formatFn))
	}
	// Compute self
	var childrenCum int64
	for _, c := range ct.Children {
		childrenCum += c.Cum
	}
	ct.Self = ct.Cum - childrenCum
	if ct.Self < 0 {
		ct.Self = 0
	}
	if total > 0 {
		ct.SelfPct = float64(ct.Self) / float64(total) * 100
		ct.CumPct = float64(ct.Cum) / float64(total) * 100
	}
	ct.SelfFmt = formatFn(ct.Self)
	ct.CumFmt = formatFn(ct.Cum)
	return ct
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
