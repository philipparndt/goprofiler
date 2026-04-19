package java

import (
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"

	jfrparser "github.com/grafana/jfr-parser/parser"
	"github.com/philipparndt/goprofiler/internal/traceparser"
)

// ParseJFRThreads extracts thread data from a JFR recording into the TraceData format
// used by the existing trace viewer, enabling reuse of TraceTimeline and TraceGoroutines.
func ParseJFRThreads(data []byte) (*traceparser.TraceData, error) {
	p := jfrparser.NewParser(data, jfrparser.Options{SymbolProcessor: jfrparser.ProcessSymbols})

	type threadEvent struct {
		threadID   uint64
		threadName string
		startNs    int64
		state      string
		stack      []string
	}
	var events []threadEvent

	for {
		typ, err := p.ParseEvent()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse JFR event: %w", err)
		}

		if typ == p.TypeMap.T_EXECUTION_SAMPLE {
			// Get thread info
			threadRef := p.ExecutionSample.SampledThread
			threadIdx, ok := p.Threads.IDMap[threadRef]
			if !ok || int(threadIdx) >= len(p.Threads.Thread) {
				continue
			}
			thread := p.Threads.Thread[threadIdx]

			stack := resolveStack(p, p.ExecutionSample.StackTrace)
			startNs := int64(p.ExecutionSample.StartTime)

			name := thread.JavaName
			if name == "" {
				name = thread.OsName
			}

			events = append(events, threadEvent{
				threadID:   thread.JavaThreadId,
				threadName: name,
				startNs:    startNs,
				state:      "running",
				stack:      stack,
			})
		}
	}

	if len(events) == 0 {
		return &traceparser.TraceData{Meta: traceparser.TraceMeta{}}, nil
	}

	// Find time range
	var minTime, maxTime int64
	minTime = events[0].startNs
	maxTime = events[0].startNs
	for _, e := range events {
		if e.startNs < minTime {
			minTime = e.startNs
		}
		if e.startNs > maxTime {
			maxTime = e.startNs
		}
	}

	// Group by thread
	type threadData struct {
		name   string
		events []threadEvent
	}
	threads := make(map[uint64]*threadData)
	for _, e := range events {
		td, ok := threads[e.threadID]
		if !ok {
			td = &threadData{name: e.threadName}
			threads[e.threadID] = td
		}
		td.events = append(td.events, e)
	}

	// Build goroutine-compatible spans
	var goroutines []traceparser.GoroutineData
	for id, td := range threads {
		var spans []traceparser.GoroutineSpan
		for i, e := range td.events {
			endNs := e.startNs + 10_000_000 // 10ms default
			if i+1 < len(td.events) {
				endNs = td.events[i+1].startNs
			}
			spans = append(spans, traceparser.GoroutineSpan{
				StartNs: e.startNs - minTime,
				EndNs:   endNs - minTime,
				State:   e.state,
				Stack:   e.stack,
			})
		}
		goroutines = append(goroutines, traceparser.GoroutineData{
			ID:    id,
			Name:  td.name,
			Spans: spans,
		})
	}

	return &traceparser.TraceData{
		Meta: traceparser.TraceMeta{
			DurationNs:     maxTime - minTime,
			GoroutineCount: len(goroutines),
		},
		Goroutines: goroutines,
	}, nil
}

// CaptureThreadDump captures a thread dump from a local JVM via jcmd.
func CaptureThreadDump(pid int) (string, error) {
	cmd := exec.Command("jcmd", strconv.Itoa(pid), "Thread.print")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("jcmd Thread.print failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return string(out), nil
}
