## Why

When viewing a heap or goroutine snapshot, users often want to take a fresh snapshot to see how things changed -- e.g., after triggering some load or waiting for GC. Currently this requires navigating back to the connection, capturing a new snapshot, finding it in the list, and clicking View. A "Refresh" button on the profile viewer would re-capture the same profile type from the same target, overwrite the existing data, and reload the page in place.

## What Changes

- Add a "Refresh" button in the profile viewer header (next to Export) for snapshot profile types
- Backend: new endpoint `POST /api/profiles/{id}/refresh` that re-captures the same profile type from the same target, overwrites the stored data file, updates the timestamp and size, and returns the updated record
- Frontend: clicking Refresh shows a brief loading state, then reloads the profile data
- Only available for snapshot types (heap, goroutine, block, mutex, allocs, threadcreate) -- not for CPU/trace recordings (those are duration-based)
- Preserves tags and label on refresh

## Capabilities

### New Capabilities
- `refresh-snapshot`: Re-capture a snapshot profile in-place, updating the data without creating a new entry

### Modified Capabilities

_None._

## Impact

- **New**: Backend `POST /api/profiles/{id}/refresh` endpoint
- **Modified**: Frontend ProfileViewer header -- add Refresh button
- **No changes to storage schema** -- overwrites existing file and updates record
