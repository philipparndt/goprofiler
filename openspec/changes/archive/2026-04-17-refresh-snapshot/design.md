## Context

Snapshot profiles (heap, goroutine, etc.) are instant captures. Re-capturing is fast and cheap. The profile viewer already has all the context needed: the profile ID, target URL, and type.

## Decisions

### 1. Backend: `POST /api/profiles/{id}/refresh`

Steps:
1. Look up the existing profile record (get target_url and type)
2. Validate the target is still reachable
3. Collect a fresh snapshot of the same type from the same target
4. Overwrite the stored `.pb.gz` file with the new data
5. Update the record's timestamp, size (keep id, tags, label unchanged)
6. Evict any cached trace/flamegraph data for this profile ID
7. Return the updated record

Only works for snapshot types. Returns 400 for CPU/trace.

### 2. Frontend: Refresh button with loading state

A refresh icon button next to Export in the header. Click -> shows spinner -> re-fetches profile data on success.

## Risks / Trade-offs

- **Old data is lost** -- the previous snapshot is overwritten. This is intentional -- users who want to keep both should capture a new snapshot instead.
