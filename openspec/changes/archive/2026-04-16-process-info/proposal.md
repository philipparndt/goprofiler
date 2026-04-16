## Why

When you open a connection detail page, there is no indication of what process is actually running on the other end. You know the URL, but not the binary name, the arguments it was launched with, which Go version compiled it, or what OS/architecture it runs on. This missing context matters: you might be profiling a service with a surprising flag, a binary built with an old Go version, or a cross-compiled arm64 build running on a server. Basic process info answers "what am I actually looking at?" before you even start profiling.

## What Changes

- A new backend endpoint fetches the target's command line from `/debug/pprof/cmdline` and build metadata (Go version, GOOS, GOARCH) parsed from the heap debug output
- The connection detail status bar shows this info inline: binary name + args, Go version, OS, and architecture
- Info is fetched once on connect and displayed alongside the existing URL/status indicators
- No new page or tab needed -- it sits naturally in the existing header area

## Capabilities

### New Capabilities
- `process-info`: Fetch and display target process information (command line args, Go version, GOOS, GOARCH) in the connection detail header

## Impact

- **New**: `internal/api/processinfo.go` -- handler for `GET /api/targets/{id}/process-info` that fetches cmdline and parses build info from the target
- **Modified**: `internal/api/handler.go` -- register new route
- **Modified**: `src/api.ts` -- add `getProcessInfo` call and `ProcessInfo` interface
- **Modified**: `src/pages/ConnectionDetail.tsx` -- fetch process info on load, render in status bar
