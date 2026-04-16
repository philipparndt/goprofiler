## 1. Backend: Tags

- [x] 1.1 Add `tags` TEXT column to profiles table (JSON array, default '[]'), run migration
- [x] 1.2 Add `PUT /api/profiles/{id}/tags` endpoint to set tags (accepts JSON array of strings)
- [x] 1.3 Add `GET /api/tags` endpoint returning all unique tags used across profiles
- [x] 1.4 Update `GET /api/profiles` to support `tag` query parameter for filtering
- [x] 1.5 Return `tags` field in profile list and detail responses

## 2. Backend: Enhanced Diff

- [x] 2.1 Update `GET /api/profiles/diff` to also return a diff call tree (with base, compare, delta values per node) and a summary (total base, total compare, total delta)
- [x] 2.2 Create `internal/flamegraph/diff.go` with `ComputeDiff` function that takes two parsed profiles and returns diff flame graph + diff call tree with per-node base/compare/delta values

## 3. Frontend: Tag Management

- [x] 3.1 Add tag badges to profiles list in ConnectionDetail with inline add/remove
- [x] 3.2 Add tag filter dropdown in profiles list (alongside existing type filter)
- [x] 3.3 Add optional tag input in ProfilingControls before capture, applied to the resulting profile
- [x] 3.4 Update api.ts with tag types and endpoints (setTags, listTags)

## 4. Frontend: Compare Selector

- [x] 4.1 Add "Compare" button to each profile row in the ConnectionDetail profiles table
- [x] 4.2 Create CompareSelector component: shows base profile at top, candidate profiles below (same type), filterable by tag, click to navigate to diff route
- [x] 4.3 Add route `/profiles/diff` in App.tsx

## 5. Frontend: Diff Viewer

- [x] 5.1 Create DiffViewer page component that fetches diff data from `/api/profiles/diff?base=X&compare=Y`
- [x] 5.2 Render comparison summary bar (base info, compare info, total delta with color)
- [x] 5.3 Render diff flame graph using d3-flame-graph with red/blue color mapper based on delta values
- [x] 5.4 Render diff call tree with columns: Function, Base, Compare, Delta, Delta % -- red for increases, green for decreases
- [x] 5.5 Add "Hide unchanged" toggle to filter out functions with zero delta
