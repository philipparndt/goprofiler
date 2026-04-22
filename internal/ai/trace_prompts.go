package ai

import (
	"fmt"
	"strings"
	"time"
)

// Trace data types matching the traceparser package structures.
// These are passed from the frontend via Wails.

type TraceMeta struct {
	DurationNs     int64 `json:"durationNs"`
	GoroutineCount int   `json:"goroutineCount"`
	ProcessorCount int   `json:"processorCount"`
	GCCount        int   `json:"gcCount"`
}

type GoroutineSpanInfo struct {
	State    string   `json:"state"`
	StartNs  int64    `json:"start"`
	EndNs    int64    `json:"end"`
	Reason   string   `json:"reason,omitempty"`
	Stack    []string `json:"stack,omitempty"`
}

type GoroutineInfo struct {
	ID    uint64              `json:"id"`
	Name  string              `json:"name"`
	Spans []GoroutineSpanInfo `json:"spans"`
}

type BlockingInfo struct {
	Location      string   `json:"location"`
	Category      string   `json:"category"`
	TotalDuration int64    `json:"totalDuration"`
	Count         int      `json:"count"`
	Stack         []string `json:"stack,omitempty"`
}

type GCEventInfo struct {
	StartNs int64 `json:"start"`
	EndNs   int64 `json:"end"`
	PauseNs int64 `json:"pauseNs"`
}

func fmtDuration(ns int64) string {
	d := time.Duration(ns)
	if d >= time.Second {
		return fmt.Sprintf("%.2fs", d.Seconds())
	}
	if d >= time.Millisecond {
		return fmt.Sprintf("%.1fms", float64(d)/float64(time.Millisecond))
	}
	if d >= time.Microsecond {
		return fmt.Sprintf("%.1fus", float64(d)/float64(time.Microsecond))
	}
	return fmt.Sprintf("%dns", ns)
}

func summarizeGoroutine(g GoroutineInfo) string {
	var sb strings.Builder
	states := map[string]int64{}
	for _, s := range g.Spans {
		states[s.State] += s.EndNs - s.StartNs
	}
	fmt.Fprintf(&sb, "Goroutine %d (%s): %d spans\n", g.ID, g.Name, len(g.Spans))
	for _, state := range []string{"running", "runnable", "blocked", "syscall", "waiting"} {
		if d, ok := states[state]; ok && d > 0 {
			fmt.Fprintf(&sb, "  %s: %s\n", state, fmtDuration(d))
		}
	}
	// Show blocking reasons
	for _, s := range g.Spans {
		if (s.State == "blocked" || s.State == "waiting") && s.Reason != "" {
			fmt.Fprintf(&sb, "  blocked reason: %s (%s)\n", s.Reason, fmtDuration(s.EndNs-s.StartNs))
			if len(s.Stack) > 0 {
				fmt.Fprintf(&sb, "    at: %s\n", s.Stack[0])
			}
			break // just first blocking reason for summary
		}
	}
	return sb.String()
}

func summarizeBlocking(entries []BlockingInfo) string {
	var sb strings.Builder
	for i, e := range entries {
		if i >= 10 {
			fmt.Fprintf(&sb, "  ... and %d more entries\n", len(entries)-10)
			break
		}
		fmt.Fprintf(&sb, "- [%s] %s: %s total, %d occurrences\n",
			e.Category, e.Location, fmtDuration(e.TotalDuration), e.Count)
		if len(e.Stack) > 0 && len(e.Stack) <= 5 {
			for _, frame := range e.Stack {
				fmt.Fprintf(&sb, "    %s\n", frame)
			}
		}
	}
	return sb.String()
}

func summarizeGC(events []GCEventInfo) string {
	if len(events) == 0 {
		return "No GC events recorded.\n"
	}
	var totalPause, maxPause int64
	for _, e := range events {
		totalPause += e.PauseNs
		if e.PauseNs > maxPause {
			maxPause = e.PauseNs
		}
	}
	avgPause := totalPause / int64(len(events))
	return fmt.Sprintf("GC events: %d, total pause: %s, avg pause: %s, max pause: %s\n",
		len(events), fmtDuration(totalPause), fmtDuration(avgPause), fmtDuration(maxPause))
}

func BuildTraceOverviewPrompt(meta TraceMeta, goroutines []GoroutineInfo, blocking []BlockingInfo, gcEvents []GCEventInfo) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing an execution trace. The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Trace duration: %s\n", fmtDuration(meta.DurationNs))
	fmt.Fprintf(&sb, "Goroutines: %d, Processors: %d, GC events: %d\n\n", meta.GoroutineCount, meta.ProcessorCount, meta.GCCount)

	// Top goroutines by blocked time
	sb.WriteString("## Top goroutines (by total blocked/waiting time):\n\n")
	for i, g := range goroutines {
		if i >= 15 {
			fmt.Fprintf(&sb, "... and %d more goroutines\n", len(goroutines)-15)
			break
		}
		sb.WriteString(summarizeGoroutine(g))
		sb.WriteString("\n")
	}

	sb.WriteString("\n## Blocking summary:\n\n")
	sb.WriteString(summarizeBlocking(blocking))

	sb.WriteString("\n## GC summary:\n\n")
	sb.WriteString(summarizeGC(gcEvents))

	sb.WriteString("\nPlease provide a comprehensive trace analysis:\n")
	sb.WriteString("1. What is this application doing during the trace?\n")
	sb.WriteString("2. What are the main performance concerns? (blocking, contention, GC pressure)\n")
	sb.WriteString("3. Which goroutines are problematic and why?\n")
	sb.WriteString("4. Read relevant source code to explain the root causes\n")
	sb.WriteString("5. Suggest specific improvements\n")

	return sb.String()
}

func BuildTraceGoroutinePrompt(g GoroutineInfo, meta TraceMeta) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing a specific goroutine from an execution trace. The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Trace duration: %s, Total goroutines: %d\n\n", fmtDuration(meta.DurationNs), meta.GoroutineCount)

	sb.WriteString("## Goroutine details:\n\n")
	sb.WriteString(summarizeGoroutine(g))
	sb.WriteString("\n")

	// Full state transition log
	sb.WriteString("State transitions:\n")
	for i, s := range g.Spans {
		if i >= 50 {
			fmt.Fprintf(&sb, "... and %d more transitions\n", len(g.Spans)-50)
			break
		}
		dur := fmtDuration(s.EndNs - s.StartNs)
		if s.Reason != "" {
			fmt.Fprintf(&sb, "  %s %s (%s, reason: %s)\n", fmtDuration(s.StartNs), s.State, dur, s.Reason)
		} else {
			fmt.Fprintf(&sb, "  %s %s (%s)\n", fmtDuration(s.StartNs), s.State, dur)
		}
		if len(s.Stack) > 0 {
			for _, frame := range s.Stack {
				fmt.Fprintf(&sb, "    %s\n", frame)
			}
		}
	}

	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Read the source code for the functions in the stack traces\n")
	sb.WriteString("2. Explain what this goroutine is doing step by step\n")
	sb.WriteString("3. Explain why it spends time in each state (especially blocked/waiting)\n")
	sb.WriteString("4. If there are performance issues, suggest improvements\n")

	return sb.String()
}

func BuildTraceBlockingPrompt(entry BlockingInfo, allBlocking []BlockingInfo, meta TraceMeta) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing a blocking contention point from an execution trace. The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Trace duration: %s\n\n", fmtDuration(meta.DurationNs))

	sb.WriteString("## Selected blocking entry:\n\n")
	fmt.Fprintf(&sb, "Location: %s\n", entry.Location)
	fmt.Fprintf(&sb, "Category: %s\n", entry.Category)
	fmt.Fprintf(&sb, "Total blocking time: %s\n", fmtDuration(entry.TotalDuration))
	fmt.Fprintf(&sb, "Occurrences: %d\n", entry.Count)
	fmt.Fprintf(&sb, "Average per occurrence: %s\n", fmtDuration(entry.TotalDuration/int64(max(entry.Count, 1))))
	if len(entry.Stack) > 0 {
		sb.WriteString("Stack trace:\n")
		for _, frame := range entry.Stack {
			fmt.Fprintf(&sb, "  %s\n", frame)
		}
	}

	sb.WriteString("\n## Other blocking entries for context:\n\n")
	sb.WriteString(summarizeBlocking(allBlocking))

	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Read the source code at the blocking location\n")
	sb.WriteString("2. Explain what is being blocked on and why\n")
	sb.WriteString("3. Explain the significance (is this a problem or expected behavior?)\n")
	sb.WriteString("4. Suggest concrete code changes to reduce contention if applicable\n")

	return sb.String()
}

func BuildTraceSpanPrompt(span GoroutineSpanInfo, goroutineName string, adjacentSpans []GoroutineSpanInfo) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing a specific goroutine state span from an execution trace. The source code is in the current directory.\n\n")

	fmt.Fprintf(&sb, "Goroutine: %s\n", goroutineName)
	fmt.Fprintf(&sb, "State: %s\n", span.State)
	fmt.Fprintf(&sb, "Duration: %s (from %s to %s)\n", fmtDuration(span.EndNs-span.StartNs), fmtDuration(span.StartNs), fmtDuration(span.EndNs))
	if span.Reason != "" {
		fmt.Fprintf(&sb, "Reason: %s\n", span.Reason)
	}
	if len(span.Stack) > 0 {
		sb.WriteString("Stack trace:\n")
		for _, frame := range span.Stack {
			fmt.Fprintf(&sb, "  %s\n", frame)
		}
	}

	if len(adjacentSpans) > 0 {
		sb.WriteString("\nSurrounding spans for context:\n")
		for _, s := range adjacentSpans {
			dur := fmtDuration(s.EndNs - s.StartNs)
			if s.Reason != "" {
				fmt.Fprintf(&sb, "  %s %s (%s, reason: %s)\n", fmtDuration(s.StartNs), s.State, dur, s.Reason)
			} else {
				fmt.Fprintf(&sb, "  %s %s (%s)\n", fmtDuration(s.StartNs), s.State, dur)
			}
		}
	}

	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Read the source code referenced in the stack trace\n")
	sb.WriteString("2. Explain what the goroutine is doing in this state\n")
	sb.WriteString("3. Explain the reason for this state transition\n")
	sb.WriteString("4. Is this expected behavior or a potential issue?\n")

	return sb.String()
}

func BuildTraceGCPrompt(gcEvents []GCEventInfo, meta TraceMeta) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing garbage collection behavior from an execution trace. The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Trace duration: %s, Goroutines: %d\n\n", fmtDuration(meta.DurationNs), meta.GoroutineCount)

	sb.WriteString("## GC events:\n\n")
	sb.WriteString(summarizeGC(gcEvents))
	sb.WriteString("\n")

	if len(gcEvents) > 0 {
		sb.WriteString("Individual GC events:\n")
		for i, e := range gcEvents {
			if i >= 20 {
				fmt.Fprintf(&sb, "... and %d more GC events\n", len(gcEvents)-20)
				break
			}
			fmt.Fprintf(&sb, "  GC #%d: start=%s, duration=%s, pause=%s\n",
				i+1, fmtDuration(e.StartNs), fmtDuration(e.EndNs-e.StartNs), fmtDuration(e.PauseNs))
		}
	}

	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Assess whether GC is a performance bottleneck in this trace\n")
	sb.WriteString("2. Analyze the GC frequency and pause distribution\n")
	sb.WriteString("3. Look at the source code to identify what drives heap allocations\n")
	sb.WriteString("4. Suggest ways to reduce GC pressure if applicable\n")

	return sb.String()
}

func BuildTraceGoroutinesTabPrompt(goroutines []GoroutineInfo, meta TraceMeta) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing goroutine behavior from an execution trace. The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Trace duration: %s, Total goroutines: %d, Processors: %d\n\n", fmtDuration(meta.DurationNs), meta.GoroutineCount, meta.ProcessorCount)

	sb.WriteString("## Goroutine summaries:\n\n")
	for i, g := range goroutines {
		if i >= 20 {
			fmt.Fprintf(&sb, "... and %d more goroutines\n", len(goroutines)-20)
			break
		}
		sb.WriteString(summarizeGoroutine(g))
		sb.WriteString("\n")
	}

	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Identify goroutines with unusual state patterns (too much blocking, never running, etc.)\n")
	sb.WriteString("2. Group goroutines by behavior pattern (workers, listeners, one-shot, etc.)\n")
	sb.WriteString("3. Read source code for the most problematic goroutines\n")
	sb.WriteString("4. Identify potential goroutine leaks, contention, or inefficient patterns\n")
	sb.WriteString("5. Suggest improvements\n")

	return sb.String()
}

func BuildTraceBlockingTabPrompt(blocking []BlockingInfo, meta TraceMeta) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing blocking and contention from an execution trace. The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Trace duration: %s, Goroutines: %d\n\n", fmtDuration(meta.DurationNs), meta.GoroutineCount)

	sb.WriteString("## All blocking entries by category:\n\n")
	// Group by category
	categories := map[string][]BlockingInfo{}
	for _, e := range blocking {
		categories[e.Category] = append(categories[e.Category], e)
	}
	for _, cat := range []string{"channel", "mutex", "network", "syscall", "scheduler", "other"} {
		entries := categories[cat]
		if len(entries) == 0 {
			continue
		}
		var totalDur int64
		for _, e := range entries {
			totalDur += e.TotalDuration
		}
		fmt.Fprintf(&sb, "### %s (total: %s, %d locations)\n", cat, fmtDuration(totalDur), len(entries))
		sb.WriteString(summarizeBlocking(entries))
		sb.WriteString("\n")
	}

	sb.WriteString("Please:\n")
	sb.WriteString("1. Identify the most impactful blocking patterns\n")
	sb.WriteString("2. Read source code for the top blocking locations\n")
	sb.WriteString("3. Explain the root cause of each major contention point\n")
	sb.WriteString("4. Suggest concrete code changes to reduce blocking\n")
	sb.WriteString("5. Distinguish between expected blocking (I/O waits) and problematic contention\n")

	return sb.String()
}
