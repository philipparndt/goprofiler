## Why

GoProfiler currently runs as a web application served from a single Go binary. Shipping it as a Wails desktop app gives users a native window experience (system tray, window management, OS integration) while keeping the same React frontend. Both modes (desktop and web) must remain available from the same codebase.

## What Changes

- Add Wails v2 integration with a desktop entry point (`cmd/desktop/`)
- Keep the existing web server entry point (`cmd/goprofiler/`) unchanged
- Expose backend functionality via Wails bindings (replacing HTTP calls in desktop mode)
- Frontend detects runtime mode (Wails vs browser) and routes API calls accordingly
- Add build targets for desktop app (macOS, Linux, Windows)
- Update Makefile with desktop build commands

## Capabilities

### New Capabilities
- `wails-integration`: Wails app shell, bindings, build configuration, and dual-mode frontend API layer

### Modified Capabilities

## Impact

- **New dependency**: Wails v2 SDK (`github.com/wailsapp/wails/v2`)
- **New entry point**: `cmd/desktop/main.go` with Wails app setup
- **Frontend changes**: API layer abstracted to support both HTTP fetch and Wails runtime calls
- **Build system**: New Makefile targets for `wails build` / `wails dev`
- **No breaking changes**: Existing web mode and CLI flags remain identical
