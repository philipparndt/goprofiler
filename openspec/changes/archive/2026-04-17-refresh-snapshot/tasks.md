## 1. Backend

- [x] 1.1 Add `POST /api/profiles/{id}/refresh` endpoint that looks up the profile, collects a fresh snapshot of the same type from the same target, overwrites the file, updates timestamp/size, and returns the updated record
- [x] 1.2 Reject refresh for CPU/trace types with 400 error
- [x] 1.3 Evict trace cache entry on refresh (in case it was a trace somehow)

## 2. Frontend

- [x] 2.1 Add `refreshProfile(id)` method to api.ts
- [x] 2.2 Add Refresh button (circular arrow icon) in ProfileViewer header, next to Export, visible only for snapshot types
- [x] 2.3 Show loading state during refresh, then reload the profile data on success
