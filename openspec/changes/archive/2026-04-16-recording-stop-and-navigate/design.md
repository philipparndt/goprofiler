## Context

Currently, CPU and trace profiling works synchronously: the backend makes an HTTP request to the target's pprof endpoint with `?seconds=N`, waits for it to complete, then returns the data. Cancel aborts the request and discards everything. There's no "stop early" option.

Go's pprof HTTP handler for `/debug/pprof/profile` starts CPU profiling, waits for the duration, stops profiling, then writes the data to the response. If the client disconnects early, the handler detects the context cancellation and stops profiling -- but the data is lost because the response writer is already closed.

## Goals / Non-Goals

**Goals:**
- "Stop" button that ends recording early and saves data collected so far
- "Cancel" button that discards data (existing behavior)
- Auto-navigate to profile viewer after any successful collection

**Non-Goals:**
- Streaming profile data during collection
- Changing the Go target application

## Decisions

### 1. Async recording with backend goroutine

Change the recording flow from synchronous to async:
1. `POST /api/targets/{id}/profiles` starts a background goroutine that makes the pprof request
2. Returns immediately with `{"status": "recording", "recordingId": "..."}`
3. `POST /api/targets/{id}/profiles/stop` signals the recording to stop early -- cancels the pprof HTTP request, waits for whatever data was returned, saves it
4. `DELETE /api/targets/{id}/profiles/active` (cancel) cancels the request and discards data
5. `GET /api/targets/{id}/profiles/active` polls recording status -- returns progress and profile ID when done

**Why**: Decouples the HTTP request lifecycle from the recording. The frontend can poll for completion and react to stop/cancel independently.

### 2. Stop mechanism: cancel context + capture response

When "Stop" is called, we cancel the context on the outgoing HTTP request to the target. Go's pprof handler will detect the context cancellation and stop profiling. The response body may or may not contain data depending on timing.

For a more reliable approach: use a shorter `seconds` parameter but keep extending it. Actually, the simplest reliable approach:
- Start with `seconds=300` (5 min max)
- "Stop" cancels the context, and we read whatever response body bytes were received
- If the body is empty (handler hadn't started writing yet), we retry with the actual elapsed duration

Simpler alternative: **don't use the `seconds` parameter at all**. Instead, programmatically start/stop profiling via the target. But this requires the target to expose a custom endpoint.

**Pragmatic approach**: Use the `seconds` parameter as a max duration. When the user clicks "Stop", cancel the HTTP request. The pprof handler may or may not return data. If no data is returned, show a message saying "Recording stopped but no data was captured (try a longer recording)."

### 3. Auto-navigate after completion

When a profile is successfully saved (recording finishes or snapshot completes), the frontend navigates to `/profiles/{id}`. The profile ID is returned in the API response.

**Why**: Eliminates the manual step of finding and clicking the new profile in the table.

### 4. Frontend: two buttons during recording

During a recording, show:
- **Stop** (primary/green): Stop early and save -- calls the stop endpoint
- **Cancel** (danger/red): Discard and abort -- calls the cancel endpoint

**Why**: Clear distinction between "I want what I have so far" and "forget it".

## Risks / Trade-offs

- **Partial data on early stop may be empty** -> If stopped very quickly (< 1 second), pprof may not have written any data yet. Show a clear message.
- **Async flow adds complexity** -> Mitigated by keeping the polling simple (1s interval) and the state machine small (idle -> recording -> done/failed).
