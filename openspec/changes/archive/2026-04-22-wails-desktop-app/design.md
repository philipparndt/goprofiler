## Context

GoProfiler is a single-binary Go application with an embedded React frontend served over HTTP. The backend uses chi for routing and exposes a REST API at `/api`. The frontend calls this API via `fetch()` with a hardcoded `/api` base path. The goal is to add a Wails desktop mode alongside the existing web mode.

Wails v2 embeds a webview and allows Go functions to be called directly from JavaScript via bindings, bypassing HTTP entirely. However, the frontend must continue working in both contexts.

## Goals / Non-Goals

**Goals:**
- Ship GoProfiler as a native desktop app via Wails v2
- Keep the existing `cmd/goprofiler` web server entry point working unchanged
- Share all backend logic between both modes (no code duplication)
- Frontend works in both Wails webview and regular browser

**Non-Goals:**
- System tray integration, auto-update, or OS-specific features (future work)
- Replacing the web mode — both modes coexist permanently
- Mobile support

## Decisions

### 1. Separate entry points, shared core

**Decision**: Create `cmd/desktop/main.go` for Wails, keep `cmd/goprofiler/main.go` for web.

Both entry points instantiate the same service layer (`connection.Store`, `storage.Store`, `monitor.Service`) and bind them differently — HTTP handlers vs Wails bindings.

**Alternative considered**: Single binary with `--desktop` flag. Rejected because Wails has its own build toolchain (`wails build`) and embedding model that conflicts with the web server's `embed.FS` approach.

### 2. Wails bindings wrapping existing handler logic

**Decision**: Create an `App` struct in `cmd/desktop/` that wraps the existing service layer and exposes methods matching the REST API semantics. The Wails bindings call the same internal packages.

This avoids duplicating business logic. The binding methods return Go structs that Wails auto-serializes to JSON for the frontend.

### 3. Dual-mode API layer in frontend

**Decision**: Abstract the frontend API layer (`api.ts`) to detect the runtime environment and dispatch accordingly:
- **Browser mode**: `fetch("/api/...")` as today
- **Wails mode**: Call bound Go functions via `window.go.main.App.MethodName()`

Detection uses `window.runtime` (injected by Wails). A thin adapter maps each API function to either fetch or Wails call.

**Alternative considered**: Running an HTTP server inside the Wails app too. Rejected — adds unnecessary complexity and port conflicts. Wails bindings are the idiomatic approach.

### 4. Build system

**Decision**: Add Makefile targets `build-desktop` and `dev-desktop` that invoke `wails build` and `wails dev`. The existing `build` / `dev` targets remain unchanged.

Wails requires its own project config (`wails.json`) in the desktop entry point directory.

## Risks / Trade-offs

- **Wails v2 dependency size**: Wails pulls in CGO dependencies for webview. Mitigation: desktop builds are separate from web builds; web binary stays lean.
- **API surface duplication**: Wails bindings mirror HTTP endpoints, creating two places to update. Mitigation: bindings are thin wrappers calling the same internal packages; consider code generation if the surface grows.
- **Platform testing**: Desktop builds need testing on macOS/Linux/Windows. Mitigation: start with macOS only, expand later.
- **Frontend bundle**: Wails embeds the frontend differently (via its own embed). The web mode uses `internal/frontend/embed.go`. Two embedding paths exist but share the same built frontend assets.
