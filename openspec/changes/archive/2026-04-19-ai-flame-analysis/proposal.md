## Why

Flame graphs show *where* CPU/memory is spent, but understanding *why* requires reading the source code and reasoning about the algorithms involved. This manual process is slow and requires deep familiarity with the codebase. By integrating AI analysis via Claude Code CLI, the profiler can explain hot paths and suggest optimizations in the context of the actual source code — turning the profiler from a measurement tool into a diagnostic assistant.

## What Changes

- **Source directory connection**: Users can configure a local source directory per target (or globally) in the Wails desktop app. This tells the AI where to find the relevant Go source code.
- **AI analysis buttons**: The profile viewer gains two buttons:
  - **Explain**: Analyzes the top hot functions and explains what the code is doing and why it consumes resources
  - **Optimize**: Analyzes hot functions against source code and suggests concrete code improvements
- **Context menu on flame graph**: Right-clicking a frame in the flame graph shows an "Explain" option that triggers AI analysis scoped to that specific function and its call chain
- **Claude Code integration**: Analysis is performed by spawning `claude` CLI (Claude Code) as a background process from the Wails app, passing the profile data and source directory as context. Results are streamed back and displayed in a panel.
- **Desktop-only feature**: This feature is only available in the Wails desktop app (not the web app), since it requires local filesystem access and spawning local processes.

## Capabilities

### New Capabilities
- `source-directory`: Configure and persist a local source directory path per target for AI analysis context
- `ai-analysis`: Spawn Claude Code CLI to analyze flame graph data against source code, with explain and optimize modes
- `flamegraph-context-menu`: Right-click context menu on flame graph frames with an "Explain" action

### Modified Capabilities

## Impact

- **Backend (Wails only)**: New Go bindings in `app.go` for source directory management and Claude Code process spawning
- **Frontend**: New UI components for source directory config, AI analysis panel, and flame graph context menu in `ProfileViewer.tsx`
- **Dependencies**: Requires `claude` CLI (Claude Code) to be installed on the user's machine
- **Storage**: Source directory paths persisted alongside target connection config
