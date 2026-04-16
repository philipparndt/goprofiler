## Context

Currently, `internal/connection/store.go` holds targets in an in-memory map. The SQLite `targets` table in `internal/storage/db.go` is written to on connect but never read back on startup. Disconnecting removes the target entirely. Users lose all connection history on restart.

The user wants connections persisted to `~/.config/goprofiler/connections.json` as a simple JSON file, replacing the SQLite targets table.

## Goals / Non-Goals

**Goals:**
- Persist known targets to `~/.config/goprofiler/connections.json`
- Load saved targets on startup (as inactive/saved, not auto-connected)
- Disconnect keeps the target in the saved list
- Provide reconnect and permanent remove actions

**Non-Goals:**
- Auto-reconnect on startup (user must explicitly reconnect)
- Migrate existing SQLite targets data

## Decisions

### 1. JSON file at `~/.config/goprofiler/connections.json`

A simple JSON array of target objects (url, label, lastConnected).

**Why**: Flat file is simpler than SQLite for a small list of targets. Easy to inspect and edit manually. `~/.config/goprofiler/` follows XDG conventions on macOS/Linux.

### 2. Connection store manages persistence directly

The `connection.Store` takes a config path, loads on init, and writes on every mutation (connect, disconnect, remove). No separate persistence layer.

**Why**: The target list is small (tens of entries at most). Writing the full file on each change is simple and atomic enough.

### 3. Remove SQLite targets table

The `targets` table in SQLite is no longer needed. Remove the `SaveTarget`/`ListSavedTargets` methods from the storage package and drop the table migration.

**Why**: Avoid two sources of truth. The JSON file replaces this entirely.

## Risks / Trade-offs

- **Concurrent writes** -> Mitigated by the existing mutex in connection.Store. Only one goroutine writes at a time.
- **File corruption on crash** -> Write to temp file then rename (atomic on most filesystems).
