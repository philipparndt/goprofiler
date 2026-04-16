## 1. Backend: Async Recording

- [x] 1.1 Refactor CPU/trace recording in handler to be async: start a goroutine, return immediately with recording status
- [x] 1.2 Add `GET /api/targets/{id}/profiles/active` endpoint returning recording status (idle/recording/done/failed) and the profile ID when done
- [x] 1.3 Add `POST /api/targets/{id}/profiles/stop` endpoint that cancels the pprof request context, waits for the goroutine to finish, and saves whatever data was collected
- [x] 1.4 Keep existing `DELETE /api/targets/{id}/profiles/active` (cancel) that discards data

## 2. Frontend: Recording Controls

- [x] 2.1 Update ProfilingControls to poll `GET /api/targets/{id}/profiles/active` every second during recording to get status and profile ID on completion
- [x] 2.2 Show two buttons during recording: green "Stop" (calls stop endpoint) and red "Cancel" (calls cancel endpoint)
- [x] 2.3 Handle the "no data captured" case with a user-friendly message

## 3. Frontend: Auto-Navigate

- [x] 3.1 After successful recording (stop or full duration), navigate to `/profiles/{profileId}`
- [x] 3.2 After successful single snapshot, navigate to `/profiles/{profileId}`
- [x] 3.3 After "All Snapshots", refresh the profiles list instead of navigating
