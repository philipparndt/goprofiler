## Why

Two UX problems: (1) When recording CPU or trace profiles, you must wait the full duration -- there's no way to stop early and see what was captured so far. Cancel discards everything. (2) After any profile completes (recording or snapshot), you stay on the profiling page and have to manually click "View" in the profiles table. The results should open automatically.

## What Changes

- Add a "Stop" button (distinct from "Cancel") during CPU and trace recordings that stops the recording early and saves the partial data
- Keep the existing "Cancel" button that discards data
- After any successful profile collection (recording or snapshot), automatically navigate to the profile viewer
- Backend: change CPU/trace recording to use a long max duration internally, and support early termination that returns collected data

## Capabilities

### New Capabilities
- `recording-early-stop`: Stop a CPU or trace recording early and save the data collected so far

### Modified Capabilities
- `profile-collection`: Auto-navigate to profile viewer after successful collection

## Impact

- **Modified**: Backend handler -- separate "stop" endpoint from "cancel"; stop signals the pprof request to finish early while keeping data
- **Modified**: Backend collector -- handle context cancellation gracefully, return partial data
- **Modified**: Frontend ProfilingControls -- add Stop button alongside Cancel, navigate on completion
- **Note**: Go's pprof `/debug/pprof/profile` returns data when the client disconnects, so cancelling the HTTP request from our backend actually does return the data collected up to that point. We need to capture this instead of discarding it.
