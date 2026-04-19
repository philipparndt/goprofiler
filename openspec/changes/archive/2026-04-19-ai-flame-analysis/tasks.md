## 1. Source Directory Configuration

- [x] 1.1 Add `SourceDir` field to target/connection config struct and persist it (connection store)
- [x] 1.2 Add Wails binding `SetSourceDir(targetID, path)` and `GetSourceDir(targetID)` in `app.go`
- [x] 1.3 Add Wails binding `BrowseSourceDir()` that opens a native directory picker dialog and returns the selected path
- [x] 1.4 Add source directory input with browse button in the connection detail "Info" tab in the frontend

## 2. Claude Code Integration (Backend)

- [x] 2.1 Add `CheckClaudeAvailable()` Wails binding that checks if `claude` CLI is in PATH
- [x] 2.2 Create `internal/ai/claude.go` with a `RunAnalysis(sourceDir, prompt string)` function that spawns `claude -p "<prompt>" --output-format stream-json` and streams JSON events via a channel
- [x] 2.3 Add Wails bindings `StartAnalysis(targetID, profileID, mode, functionName)` and `CancelAnalysis()` that manage the Claude Code process lifecycle and emit Wails events for streaming results
- [x] 2.4 Build prompt templates for "explain" mode (top functions + stats + source dir) and "optimize" mode (same + request for code suggestions), with support for scoping to a specific function or zoomed subtree

## 3. AI Analysis Panel (Frontend)

- [x] 3.1 Create `AiAnalysisPanel.tsx` slide-out panel component that subscribes to Wails events for streaming results, renders markdown, and shows loading/cancel/complete states
- [x] 3.2 Add "Explain" and "Optimize" buttons to the profile viewer toolbar (visible only in Wails mode and when Claude is available)
- [x] 3.3 Wire the buttons to call `StartAnalysis` with the appropriate mode, passing the current profile's top functions (or zoomed subtree functions) and the target's source directory
- [x] 3.4 Add `isWails()` guard so AI buttons are hidden in web mode; check Claude availability on mount and disable buttons with tooltip if not found

## 4. Flame Graph Context Menu

- [x] 4.1 Add a `contextmenu` event handler on the flame graph container that captures the right-clicked frame's function name and position
- [x] 4.2 Create a `ContextMenu.tsx` component that renders a positioned menu with "Explain this function" option (disabled if no source dir)
- [x] 4.3 Wire "Explain this function" to call `StartAnalysis` with the selected function name, its callers/callees from the call tree, and the source directory
