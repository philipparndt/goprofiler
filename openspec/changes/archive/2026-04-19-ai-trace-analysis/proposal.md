## Why

Tracing is one of GoProfiler's most powerful features, but also the hardest to interpret. Users see timelines of goroutine states, blocking summaries, and GC events — but connecting these observations to actionable insights requires deep Go runtime knowledge. Many users can't answer basic questions like "Why is my request slow?" or "What's causing this contention?" just by looking at the trace.

AI analysis can bridge this gap by interpreting trace data in the context of the user's source code, turning raw observations into explanations and recommendations.

## What Changes

- **Trace overview analysis**: An "Analyze Trace" button that generates a high-level summary of the entire trace — what happened, key findings, performance concerns
- **Per-tab AI buttons**: Each trace tab (timeline, goroutines, GC, blocking) gets context-aware AI analysis that focuses on that tab's data
- **Goroutine explain**: Click a goroutine in the timeline or table to get an AI explanation of what it's doing, why it's blocked, and what its state pattern means
- **Blocking explain**: Click a blocking entry to get an AI explanation of the contention, its root cause in the source code, and optimization suggestions
- **Span context menu**: Right-click a span in the timeline to get an AI explanation of that specific state transition
- **GC impact analysis**: AI explains the GC behavior, whether it's healthy, and what's driving allocation pressure
- **All analysis uses the configured AI provider** (Claude Code / GitHub Copilot) and respects the source directory and permission settings from the existing AI infrastructure

## Capabilities

### New Capabilities
- `trace-ai-overview`: High-level AI analysis summarizing the entire trace with key findings
- `trace-ai-contextual`: Per-tab and per-element AI analysis (goroutine explain, blocking explain, span explain, GC analysis)

### Modified Capabilities

## Impact

- **Frontend**: New AI buttons and context menus in all TraceViewer sub-components; reuse existing `AiAnalysisPanel` for results display
- **Backend**: New prompt templates in `internal/ai/prompts.go` for trace-specific analysis; new Wails bindings for trace analysis requests
- **No new dependencies**: Reuses existing AI infrastructure (Claude Code CLI, settings, panel, streaming)
