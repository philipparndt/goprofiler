## 1. Project Scaffolding

- [x] 1.1 Initialize Go module (`go mod init`), add chi, vlog, google/pprof, modernc.org/sqlite dependencies
- [x] 1.2 Create project directory structure: `cmd/goprofiler/`, `internal/`, `frontend/`
- [x] 1.3 Scaffold React app in `frontend/` with Vite, TypeScript, Radix UI, and d3-flame-graph
- [x] 1.4 Set up `embed.FS` in Go to serve the built frontend SPA at `/`
- [x] 1.5 Create Makefile with targets: `build` (frontend + backend), `dev` (hot reload), `clean`

## 2. Backend: Connection Management

- [x] 2.1 Implement connection model and in-memory connection store (target URL, status, last health check)
- [x] 2.2 Implement pprof endpoint validation (fetch `/debug/pprof/` and verify response)
- [x] 2.3 Create REST API: `POST /api/targets` (connect), `DELETE /api/targets/{id}` (disconnect), `GET /api/targets` (list)
- [x] 2.4 Implement periodic health check goroutine for connected targets
- [x] 2.5 Persist saved targets to SQLite (URL, label, last connected timestamp)

## 3. Backend: Profile Collection

- [x] 3.1 Implement CPU profile collector: fetch `/debug/pprof/profile?seconds=N` with context cancellation
- [x] 3.2 Implement snapshot profile collectors: heap, goroutine, block, mutex endpoints
- [x] 3.3 Parse pprof protobuf data using `github.com/google/pprof/profile` into structured form
- [x] 3.4 Convert parsed profiles to JSON flame graph structure (tree of frames with name, self, total)
- [x] 3.5 Create REST API: `POST /api/targets/{id}/profiles` (start profiling), `DELETE /api/targets/{id}/profiles/active` (cancel), `GET /api/profiles` (list), `GET /api/profiles/{id}` (get with flame graph JSON), `DELETE /api/profiles/{id}` (delete)
- [x] 3.6 Implement diff profile generation (merge two profiles with negation for comparison)

## 4. Backend: Profile Storage

- [x] 4.1 Set up SQLite database with migrations for profiles table (id, target_url, type, timestamp, duration, size, label, file_path)
- [x] 4.2 Implement profile file storage: save raw `.pb.gz` files to `~/.goprofiler/profiles/`
- [x] 4.3 Implement profile CRUD operations (create, list with filters, get, delete, update label)
- [x] 4.4 Implement raw profile export endpoint: `GET /api/profiles/{id}/raw`

## 5. Backend: Server & Logging

- [x] 5.1 Create `cmd/goprofiler/main.go` with chi router setup, vlog initialization, and embedded SPA serving
- [x] 5.2 Wire up all API routes with appropriate middleware (logging, recovery, CORS for dev)
- [x] 5.3 Add CLI flags: `--port`, `--data-dir`, `--log-level`

## 6. Frontend: Shell & Navigation

- [x] 6.1 Set up dark theme with CSS variables (background, surface, text, accent colors)
- [x] 6.2 Build application shell layout: sidebar navigation + main content area using Radix primitives
- [x] 6.3 Implement client-side routing (React Router): Dashboard, Connections, Profiles, Setup/Help
- [x] 6.4 Build API client module with typed fetch wrappers for all backend endpoints

## 7. Frontend: Connection Management

- [x] 7.1 Build connection panel: add connection form (URL input + connect button), connection cards with status indicators
- [x] 7.2 Implement connection state management (connect, disconnect, health status updates)
- [x] 7.3 Build saved targets list with reconnect and delete actions

## 8. Frontend: Profiling Controls

- [x] 8.1 Build profiling control panel: profile type selector (CPU/Heap/Goroutine/Block/Mutex), duration input for CPU
- [x] 8.2 Implement CPU profiling flow with progress bar (elapsed/remaining time) and cancel button
- [x] 8.3 Implement snapshot profiling flow (instant capture with loading state)
- [x] 8.4 Build "Capture All Snapshots" action

## 9. Frontend: Flame Graph Visualization

- [x] 9.1 Integrate d3-flame-graph component with custom dark-theme styling and color-by-package scheme
- [x] 9.2 Implement flame graph zoom (click to zoom, breadcrumb trail, reset zoom)
- [x] 9.3 Implement flame graph search (highlight matching frames, show match percentage)
- [x] 9.4 Implement flame graph tooltips (function name, package, self/cumulative time, percentage, source location)
- [x] 9.5 Implement color mode toggle (color by package vs. color by heat)
- [x] 9.6 Implement orientation toggle (flame graph vs. icicle graph)
- [x] 9.7 Implement diff flame graph view (red=regression, blue=improvement)

## 10. Frontend: Profile Management

- [x] 10.1 Build profiles list view with sortable columns (target, type, timestamp, duration, size) and filters
- [x] 10.2 Build profile viewer page: flame graph + summary panel + top functions table
- [x] 10.3 Implement top functions table (sortable by flat/cumulative time, click to zoom flame graph)
- [x] 10.4 Implement profile actions: delete, bulk delete, export raw file, edit label
- [x] 10.5 Implement profile comparison: select two profiles and open diff flame graph

## 11. Frontend: Dashboard & Help

- [x] 11.1 Build dashboard view: active connections cards, recent profiles, quick-start profiling buttons
- [x] 11.2 Build empty state with welcome message and "connect your first target" guidance
- [x] 11.3 Build setup/help page with pprof enablement instructions and copyable code snippets

## 12. Polish & Documentation

- [ ] 12.1 Add error handling and user-friendly error messages across all API interactions
- [ ] 12.2 Add loading states and skeleton loaders for async operations
- [ ] 12.3 Write README with installation instructions, quick start guide, and screenshots
- [ ] 12.4 Test end-to-end flow: connect to a sample Go app, collect CPU profile, view flame graph
