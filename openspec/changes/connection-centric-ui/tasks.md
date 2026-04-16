## 1. Backend: Filter Profiles by Target

- [x] 1.1 Add `target` query param to `GET /api/profiles` to filter by target URL
- [x] 1.2 Add `GET /api/targets/{id}/profile-count` or include profile count in targets list response

## 2. Frontend: Connection Detail Page

- [x] 2.1 Create `ConnectionDetail.tsx` with: status bar (URL, status, Disconnect/Reconnect), profiling controls (Record/Snapshot groups), and profiles table filtered to this target
- [x] 2.2 Add route `/connections/:id` in App.tsx

## 3. Frontend: Connections List Redesign

- [x] 3.1 Redesign Connections page: clickable cards (URL, status, profile count) that navigate to `/connections/:id`, with add-connection form at top and saved targets below
- [x] 3.2 Remove `TargetCard` with inline profiling controls (moved to ConnectionDetail)

## 4. Frontend: Navigation & Routing Cleanup

- [x] 4.1 Remove "Profiles" from sidebar navigation in App.tsx
- [x] 4.2 Remove standalone Profiles page route; keep `/profiles/:id` for the profile viewer
- [x] 4.3 Update Dashboard to link connection cards to `/connections/:id` and show recent profiles with links to profile viewer

## 5. Cleanup

- [x] 5.1 Delete `src/pages/Profiles.tsx` (functionality moved to ConnectionDetail)
- [x] 5.2 Remove unused "New Profile" card components and related imports
