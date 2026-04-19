package java

import (
	"fmt"
	"io"

	jfrparser "github.com/grafana/jfr-parser/parser"
	"github.com/grafana/jfr-parser/parser/types/def"
)

// JFREventSummary represents a summary of events by type.
type JFREventSummary struct {
	Categories []JFREventCategory `json:"categories"`
	TotalEvents int               `json:"totalEvents"`
}

type JFREventCategory struct {
	Name   string `json:"name"`
	Count  int    `json:"count"`
	TypeID int64 `json:"typeId"`
}

// ParseJFREventSummary scans a JFR recording and returns event counts by type.
func ParseJFREventSummary(data []byte) (*JFREventSummary, error) {
	p := jfrparser.NewParser(data, jfrparser.Options{})

	type tid = def.TypeID
	counts := make(map[tid]int)
	names := make(map[tid]string)

	for {
		typ, err := p.ParseEvent()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse JFR event: %w", err)
		}
		counts[typ]++
		// Map known types to names
		if _, ok := names[typ]; !ok {
			names[typ] = resolveEventName(p, typ)
		}
	}

	var categories []JFREventCategory
	total := 0
	for id, count := range counts {
		name := names[id]
		if name == "" {
			name = fmt.Sprintf("Unknown(%d)", id)
		}
		categories = append(categories, JFREventCategory{
			Name:   name,
			Count:  count,
			TypeID: int64(id),
		})
		total += count
	}

	// Sort by count descending
	for i := 1; i < len(categories); i++ {
		for j := i; j > 0 && categories[j].Count > categories[j-1].Count; j-- {
			categories[j], categories[j-1] = categories[j-1], categories[j]
		}
	}

	return &JFREventSummary{
		Categories:  categories,
		TotalEvents: total,
	}, nil
}

func resolveEventName(p *jfrparser.Parser, typ def.TypeID) string {
	tm := &p.TypeMap
	switch typ {
	case tm.T_EXECUTION_SAMPLE:
		return "CPU Sample"
	case tm.T_ALLOC_IN_NEW_TLAB:
		return "Allocation (TLAB)"
	case tm.T_ALLOC_OUTSIDE_TLAB:
		return "Allocation (Outside TLAB)"
	case tm.T_ALLOC_SAMPLE:
		return "Allocation Sample"
	case tm.T_MONITOR_ENTER:
		return "Monitor Enter"
	case tm.T_THREAD_PARK:
		return "Thread Park"
	case tm.T_ACTIVE_SETTING:
		return "Active Setting"
	case tm.T_WALL_CLOCK_SAMPLE:
		return "Wall Clock Sample"
	case tm.T_LIVE_OBJECT:
		return "Live Object"
	default:
		return ""
	}
}
