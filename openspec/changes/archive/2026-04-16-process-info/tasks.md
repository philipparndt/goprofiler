## 1. Backend: Process Info Endpoint

- [x] 1.1 Create `internal/api/processinfo.go` with a handler that fetches `/debug/pprof/cmdline` from the target and splits the response into a `[]string` cmdline array
- [x] 1.2 In the same handler, fetch `/debug/pprof/heap?debug=1` from the target and scan the response for build info header lines to extract `goVersion`, `goos`, and `goarch`
- [x] 1.3 Return a JSON response with `cmdline`, `goVersion`, `goos`, `goarch`; return partial data (not an error) if only some fields could be populated
- [x] 1.4 Register `GET /api/targets/{id}/process-info` in `handler.go` Routes()

## 2. Frontend: API Client

- [x] 2.1 Add `ProcessInfo` interface to `api.ts` with fields: `cmdline: string[]`, `goVersion: string`, `goos: string`, `goarch: string`
- [x] 2.2 Add `getProcessInfo(targetId: string)` to the `api` object in `api.ts`

## 3. Frontend: Display in Connection Detail

- [x] 3.1 In `ConnectionDetail.tsx`, fetch process info via `api.getProcessInfo` in a `useEffect` when `target.status === "connected"`; store result in local state; suppress and ignore errors
- [x] 3.2 Render a compact process info line in the status bar beneath the URL/status badge: show the binary name (last segment of `cmdline[0]`), args (truncated, full value in `title` attribute), Go version, and `goos/goarch`; render nothing if process info state is null
