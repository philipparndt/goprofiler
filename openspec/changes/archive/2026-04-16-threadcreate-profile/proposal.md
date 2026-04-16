## Why

Go's `runtime/pprof` exposes a `threadcreate` profile at `/debug/pprof/threadcreate` that records stack traces leading to OS thread creation. It is not included in the current profiler, leaving users without a way to investigate thread explosion issues -- a scenario where a Go program creates far more OS threads than expected, often due to blocking syscalls or CGo calls.

## What Changes

- Add `threadcreate` as a supported snapshot profile type alongside block and mutex
- Backend fetches `/debug/pprof/threadcreate` on demand
- Frontend lists it in the snapshot group of the profile type selector

## Capabilities

### Modified Capabilities
- `profile-collection`: Add `threadcreate` snapshot type (OS thread creation stack traces)

## Impact

- **Modified**: Backend -- add `threadcreate` to the list of supported snapshot profile types
- **Modified**: Frontend -- add `threadcreate` to the snapshot group in the profile type selector
- **No new APIs or data formats** -- same pprof binary format, same flame graph and call tree rendering
