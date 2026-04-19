## Context

GoProfiler's trace viewer displays Go execution traces with 4 tabs: timeline (canvas-based goroutine visualization), goroutines (statistics table), GC (garbage collection events), and blocking (contention analysis by category). The existing AI infrastructure (Claude Code CLI, `AiAnalysisPanel`, streaming, settings, permissions) was built for flame graph analysis and can be reused.

The trace data structure includes: goroutine spans with state/reason/stack, GC events with pause durations, processor assignments, and blocking entries categorized by type (channel, mutex, network, syscall, scheduler).

## Goals / Non-Goals

**Goals:**
- Help users understand what happened in a trace without requiring deep Go runtime expertise
- Provide analysis at multiple levels: full trace overview, per-tab focus, individual element explain
- Reuse existing AI panel and infrastructure — no new backend services
- Make AI analysis contextual to what the user is looking at

**Non-Goals:**
- Real-time AI annotations on the canvas (too complex, not enough value)
- Automated performance fixes from trace data (traces don't map to code as directly as profiles)
- Replacing the visual trace viewer with AI — it's a complement, not a replacement

## Decisions

### 1. Reuse existing AI infrastructure

**Decision:** Use the same `AiAnalysisPanel`, `StartAnalysis` binding, prompt system, and streaming events. Add new `mode` values for trace analysis and new prompt templates.

**Why:** The infrastructure already handles provider selection, permission levels, session management, streaming, and markdown rendering. No reason to build a parallel system.

### 2. Trace data summarization in prompts

**Decision:** Build structured text summaries of trace data to include in prompts, rather than sending raw JSON. Summaries include: meta stats, top goroutines by blocking time, blocking summary by category, GC stats, and relevant stack traces.

**Why:** Raw trace JSON can be enormous (thousands of spans). A curated summary keeps prompts focused and within token limits. The AI can then read source files for context.

### 3. Five analysis modes for traces

**Decision:** Support these trace-specific analysis modes:
- `trace-overview`: Full trace summary with key findings
- `trace-goroutine`: Explain a specific goroutine's behavior
- `trace-blocking`: Analyze a specific blocking entry
- `trace-gc`: Analyze GC impact
- `trace-span`: Explain a specific goroutine span (from timeline right-click)

**Why:** Each mode sends different context and asks different questions, producing more focused and useful analysis.

### 4. AI buttons placement

**Decision:**
- **Trace overview button**: In the main TraceViewer header, next to the tabs — gradient style matching flame graph AI buttons
- **Per-tab buttons**: Small AI buttons within each tab's toolbar area
- **Context menus**: Right-click on timeline spans and blocking entries for "Explain" option

**Why:** Users should be able to trigger AI from wherever they are in the trace viewer. Overview for the big picture, contextual for specific questions.

### 5. Prompt includes source directory context

**Decision:** All trace prompts include the source directory path and instruct the AI to read relevant source files based on stack traces in the trace data.

**Why:** Stack traces in spans and blocking entries reference function names. The AI can look up the actual code to explain what's happening.

## Risks / Trade-offs

- **[Large traces]** Traces with thousands of goroutines could produce very long prompt summaries. → Mitigation: Limit to top 20 goroutines by activity, top 10 blocking entries. Include count of omitted items.
- **[Desktop-only]** AI features only work in the Wails app. → Mitigation: Hide AI buttons in web mode (same as flame graph).
- **[Token cost]** Multiple analysis calls on a single trace add up. → Mitigation: Users trigger analysis explicitly, not automatically. Session resume reduces redundant context.
