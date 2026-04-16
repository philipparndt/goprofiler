## 1. Backend: Connection Persistence

- [x] 1.1 Add JSON file persistence to `connection.Store`: load from `~/.config/goprofiler/connections.json` on init, write atomically on every mutation
- [x] 1.2 Refactor `connection.Store` to track both active (connected) and saved (inactive) targets
- [x] 1.3 Change disconnect to move target to saved list instead of deleting
- [x] 1.4 Add reconnect method (validate pprof, move from saved to active)
- [x] 1.5 Add remove method (permanently delete from saved list and file)

## 2. Backend: API Changes

- [x] 2.1 Add `GET /api/targets/saved` endpoint to list saved (inactive) targets
- [x] 2.2 Add `POST /api/targets/saved/{id}/reconnect` endpoint
- [x] 2.3 Add `DELETE /api/targets/saved/{id}` endpoint to permanently remove
- [x] 2.4 Remove SQLite targets table and related methods from storage package

## 3. Frontend: Saved Targets UI

- [x] 3.1 Update API client with saved targets endpoints (list, reconnect, remove)
- [x] 3.2 Add saved targets section to Connections page showing inactive targets with Reconnect and Remove buttons

## 4. Cleanup

- [x] 4.1 Update `cmd/goprofiler/main.go` to pass config path to connection store
