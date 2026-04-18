## 1. Project Setup

- [x] 1.1 Install Wails CLI and add `github.com/wailsapp/wails/v2` dependency to `go.mod`
- [x] 1.2 Create `wails.json` config in project root with frontend build commands and output settings
- [x] 1.3 Add Makefile targets `build-desktop` and `dev-desktop`

## 2. Desktop Entry Point

- [x] 2.1 Create `cmd/desktop/main.go` with Wails app initialization (window title, size, frontend assets)
- [x] 2.2 Create `App` struct that holds `connection.Store`, `storage.Store`, `monitor.Service`, and `api.Handler` references
- [x] 2.3 Implement `App.startup()` to initialize services (same setup as `cmd/goprofiler/main.go`)

## 3. Wails Bindings

- [x] 3.1 Add connection bindings: `ListTargets`, `AddTarget`, `RemoveTarget`, `ReconnectTarget`
- [x] 3.2 Add profile bindings: `ListProfiles`, `CaptureSnapshot`, `GetFlamegraph`, `GetCallTree`, `GetTopFunctions`
- [x] 3.3 Add monitor bindings: `GetMemoryData`, `GetGoroutineData`, `GetExpvarData`
- [x] 3.4 Add trace bindings: `StartTrace`, `GetTraceData`
- [x] 3.5 Add profile management bindings: `StartRecording`, `StopRecording`, `DeleteProfile`, `UpdateProfileTags`

## 4. Frontend Dual-Mode API Layer

- [x] 4.1 Create runtime detection utility (`isWails()`) checking for `window.runtime`
- [x] 4.2 Refactor `api.ts` to abstract each API call through a mode-aware dispatcher
- [x] 4.3 Implement Wails call adapter using generated bindings from `wailsjs/go/main/App`
- [x] 4.4 Verify all existing fetch-based calls still work in browser mode (no regressions)

## 5. Build & Integration

- [x] 5.1 Verify `make build` (web mode) still works unchanged
- [x] 5.2 Verify `make build-desktop` produces a working native binary
- [x] 5.3 Verify `make dev-desktop` starts Wails dev server with hot-reload
- [x] 5.4 Test desktop app: connections, profiling, monitoring, and trace features work via bindings
