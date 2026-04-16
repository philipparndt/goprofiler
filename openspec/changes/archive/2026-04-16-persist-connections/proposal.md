## Why

Connections are currently stored only in memory. When the server restarts or a target is disconnected, all connection history is lost and users must re-enter URLs manually. For a smooth developer experience, previously used targets should be remembered and available for quick reconnection.

## What Changes

- Persist connection targets to a JSON file at `~/.config/goprofiler/connections.json`
- Load saved connections on server startup
- Disconnecting a target removes it from the active in-memory store but keeps it in the persisted list as a "saved" target
- Saved targets can be reconnected with one click or removed permanently

## Capabilities

### New Capabilities
- `connection-persistence`: Persisting and loading connection targets from a JSON config file, surviving server restarts and disconnects

### Modified Capabilities
- `pprof-connection`: Disconnect no longer deletes the target permanently; it becomes a saved (inactive) target. Add "reconnect" and "remove" actions for saved targets.

## Impact

- **Modified**: `internal/connection/store.go` -- add file-based persistence
- **Modified**: `internal/api/handler.go` -- new endpoints for saved targets (reconnect, remove)
- **Modified**: Frontend connections page -- show saved targets section
- **New file**: `~/.config/goprofiler/connections.json` created at runtime
- **Removed**: SQLite targets table (replaced by JSON file)
