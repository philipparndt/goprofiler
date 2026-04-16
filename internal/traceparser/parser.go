package traceparser

import (
	"bytes"
	"fmt"
	"io"
	"sort"
	"strings"

	"golang.org/x/exp/trace"
)

type TraceData struct {
	Meta            TraceMeta         `json:"meta"`
	Goroutines      []GoroutineData   `json:"goroutines"`
	GCEvents        []GCEvent         `json:"gcEvents"`
	Processors      []ProcessorData   `json:"processors"`
	BlockingSummary []BlockingEntry   `json:"blockingSummary"`
}

type TraceMeta struct {
	DurationNs     int64 `json:"durationNs"`
	GoroutineCount int   `json:"goroutineCount"`
	ProcessorCount int   `json:"processorCount"`
	GCCount        int   `json:"gcCount"`
}

type GoroutineData struct {
	ID    uint64          `json:"id"`
	Name  string          `json:"name"`
	Spans []GoroutineSpan `json:"spans"`
}

type GoroutineSpan struct {
	StartNs   int64    `json:"start"`
	EndNs     int64    `json:"end"`
	State     string   `json:"state"` // "running", "runnable", "blocked", "syscall", "waiting"
	Reason    string   `json:"reason,omitempty"`
	Processor int      `json:"processor,omitempty"`
	Stack     []string `json:"stack,omitempty"`
}

type GCEvent struct {
	StartNs int64 `json:"start"`
	EndNs   int64 `json:"end"`
	PauseNs int64 `json:"pauseNs"`
}

type ProcessorData struct {
	ID    int              `json:"id"`
	Spans []ProcessorSpan  `json:"spans"`
}

type ProcessorSpan struct {
	StartNs     int64  `json:"start"`
	EndNs       int64  `json:"end"`
	GoroutineID uint64 `json:"goroutineId"`
}

type BlockingEntry struct {
	Location      string   `json:"location"`
	Category      string   `json:"category"` // "channel", "mutex", "network", "syscall", "scheduler"
	TotalDuration int64    `json:"totalDuration"`
	Count         int      `json:"count"`
	Stack         []string `json:"stack,omitempty"`
}

func ParseTrace(data []byte) (*TraceData, error) {
	reader, err := trace.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("create trace reader: %w", err)
	}

	td := &TraceData{}

	// Track goroutine states
	type goroutineState struct {
		name       string
		state      string
		reason     string
		startNs    int64
		processor  int
		stack      []string
		spans      []GoroutineSpan
	}

	goroutines := make(map[trace.GoID]*goroutineState)
	gcStart := int64(-1)
	var minTime, maxTime int64
	processors := make(map[trace.ProcID]bool)

	// Blocking tracking
	type blockKey struct {
		location string
		category string
	}
	blockingMap := make(map[blockKey]*BlockingEntry)

	firstEvent := true

	for {
		ev, err := reader.ReadEvent()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read event: %w", err)
		}

		ts := int64(ev.Time())
		if firstEvent {
			minTime = ts
			firstEvent = false
		}
		if ts > maxTime {
			maxTime = ts
		}

		switch ev.Kind() {
		case trace.EventStateTransition:
			st := ev.StateTransition()

			// Goroutine state transitions
			if st.Resource.Kind == trace.ResourceGoroutine {
				gid := st.Resource.Goroutine()
				gs, ok := goroutines[gid]
				if !ok {
					gs = &goroutineState{processor: -1}
					goroutines[gid] = gs
				}

				// Close previous span
				if gs.state != "" && gs.startNs > 0 {
					span := GoroutineSpan{
						StartNs:   gs.startNs - minTime,
						EndNs:     ts - minTime,
						State:     gs.state,
						Reason:    gs.reason,
						Processor: gs.processor,
					}
					if len(gs.stack) > 0 {
						span.Stack = gs.stack
					}
					gs.spans = append(gs.spans, span)

					// Track blocking
					if gs.state == "blocked" || gs.state == "waiting" {
						cat := categorizeBlocking(gs.reason)
						loc := "unknown"
						if len(gs.stack) > 0 {
							loc = gs.stack[0]
						}
						key := blockKey{location: loc, category: cat}
						be, ok := blockingMap[key]
						if !ok {
							be = &BlockingEntry{
								Location: loc,
								Category: cat,
							}
							if len(gs.stack) > 0 {
								be.Stack = gs.stack
							}
							blockingMap[key] = be
						}
						be.TotalDuration += ts - gs.startNs
						be.Count++
					}
				}

				// Determine new state
				_, newState := st.Goroutine()
				newStateName := goStateToString(newState)

				// Get stack trace
				var stack []string
				for f := range ev.Stack().Frames() {
					stack = append(stack, f.Func)
					if len(stack) >= 8 {
						break
					}
				}

				// Extract name from creation or first meaningful stack
				if gs.name == "" && len(stack) > 0 {
					gs.name = stack[len(stack)-1]
				}

				reason := ""
				if st.Reason != "" {
					reason = st.Reason
				}

				gs.state = newStateName
				gs.reason = reason
				gs.startNs = ts
				gs.stack = stack
			}

			// Processor state transitions
			if st.Resource.Kind == trace.ResourceProc {
				pid := st.Resource.Proc()
				processors[pid] = true
			}

		case trace.EventRangeBegin:
			rng := ev.Range()
			if strings.Contains(rng.Name, "GC") || strings.Contains(rng.Name, "gc") {
				gcStart = ts
			}

		case trace.EventRangeEnd:
			rng := ev.Range()
			if (strings.Contains(rng.Name, "GC") || strings.Contains(rng.Name, "gc")) && gcStart >= 0 {
				td.GCEvents = append(td.GCEvents, GCEvent{
					StartNs: gcStart - minTime,
					EndNs:   ts - minTime,
					PauseNs: ts - gcStart,
				})
				gcStart = -1
			}
		}
	}

	// Close remaining open spans
	for _, gs := range goroutines {
		if gs.state != "" && gs.startNs > 0 {
			gs.spans = append(gs.spans, GoroutineSpan{
				StartNs:   gs.startNs - minTime,
				EndNs:     maxTime - minTime,
				State:     gs.state,
				Processor: gs.processor,
			})
		}
	}

	// Build goroutine list
	for gid, gs := range goroutines {
		if len(gs.spans) == 0 {
			continue
		}
		td.Goroutines = append(td.Goroutines, GoroutineData{
			ID:    uint64(gid),
			Name:  gs.name,
			Spans: gs.spans,
		})
	}

	// Sort goroutines by ID
	sort.Slice(td.Goroutines, func(i, j int) bool {
		return td.Goroutines[i].ID < td.Goroutines[j].ID
	})

	// Build blocking summary
	for _, be := range blockingMap {
		td.BlockingSummary = append(td.BlockingSummary, *be)
	}
	sort.Slice(td.BlockingSummary, func(i, j int) bool {
		return td.BlockingSummary[i].TotalDuration > td.BlockingSummary[j].TotalDuration
	})

	// Meta
	td.Meta = TraceMeta{
		DurationNs:     maxTime - minTime,
		GoroutineCount: len(td.Goroutines),
		ProcessorCount: len(processors),
		GCCount:        len(td.GCEvents),
	}

	return td, nil
}

func goStateToString(s trace.GoState) string {
	switch s {
	case trace.GoRunning:
		return "running"
	case trace.GoRunnable:
		return "runnable"
	case trace.GoSyscall:
		return "syscall"
	case trace.GoWaiting:
		return "waiting"
	default:
		return "waiting"
	}
}

func categorizeBlocking(reason string) string {
	r := strings.ToLower(reason)
	if strings.Contains(r, "chan") {
		return "channel"
	}
	if strings.Contains(r, "lock") || strings.Contains(r, "mutex") || strings.Contains(r, "semacquire") {
		return "mutex"
	}
	if strings.Contains(r, "net") || strings.Contains(r, "poll") || strings.Contains(r, "read") || strings.Contains(r, "write") || strings.Contains(r, "accept") {
		return "network"
	}
	if strings.Contains(r, "syscall") {
		return "syscall"
	}
	if strings.Contains(r, "preempted") || strings.Contains(r, "sched") || strings.Contains(r, "gosched") {
		return "scheduler"
	}
	return "other"
}
