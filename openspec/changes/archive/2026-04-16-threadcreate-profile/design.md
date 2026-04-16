## Context

The profiler supports two categories of profile types: recordings (CPU, which require a duration) and snapshots (heap, goroutine, block, mutex -- instant point-in-time captures). The `threadcreate` profile from `/debug/pprof/threadcreate` is another snapshot type. Adding it follows the exact same pattern as block and mutex.

## Goals / Non-Goals

**Goals:**
- Expose `threadcreate` as a selectable snapshot profile type
- Render it with the existing flame graph and call tree views without modification

**Non-Goals:**
- Any new rendering, UI components, or backend infrastructure
- Sampling or streaming -- threadcreate is always a snapshot

## Decisions

### 1. Treat threadcreate as a plain snapshot type

The backend fetches `/debug/pprof/threadcreate` with no duration parameter, identical to block and mutex. The response is a standard pprof binary that the existing pipeline parses and renders.

**Why**: No special handling is needed. The profile format is the same as all other pprof snapshots.

### 2. Place threadcreate in the snapshot group on the frontend

The profile type selector already has a "Snapshot" group. `threadcreate` is added there with a label like "Thread Create" and the standard snapshot (camera) icon.

**Why**: Consistent with the existing grouping model; no new UI patterns required.

## Risks / Trade-offs

- **None** -- this is a minimal additive change with no architectural impact. The only risk is that many Go applications expose a `threadcreate` endpoint with zero samples, which is normal and not an error.
