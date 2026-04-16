## Why

The current navigation is fragmented: connect on the Connections page, go to a separate Profiles page to see results, use a "New Profile" dialog to start profiling from there. This forces users to navigate between pages constantly. Profiling is inherently connection-centric -- you connect to a target, then profile it, then look at those profiles. The UI should reflect this workflow: pick a connection, see everything about it in one place.

## What Changes

- Restructure navigation to be connection-centric: Connections list is the entry point, clicking a connection opens a **connection detail view** with profiling controls and that connection's profiles in one page
- Remove the standalone Profiles page; profiles are always shown in context of their connection
- The connection detail view has: target status, profiling controls (record CPU / capture snapshots), and a list of profiles collected from this target
- Dashboard shows all connections with quick access; global "all profiles" view moves to a secondary role or is removed
- Sidebar navigation: Dashboard, Connections, Setup (no separate Profiles entry)

## Capabilities

### New Capabilities
- `connection-detail-view`: A dedicated page per connection showing status, profiling controls, and collected profiles in a single view

### Modified Capabilities
- `pprof-connection`: Connections list becomes the primary navigation entry; clicking a connection navigates to its detail view
- `profile-collection`: Profiling controls are embedded in the connection detail view instead of separate pages
- `web-frontend`: Sidebar removes standalone Profiles link; routing changes to `/connections/:id`

## Impact

- **New**: `src/pages/ConnectionDetail.tsx` -- connection detail page with profiling + profiles list
- **Modified**: `src/pages/Connections.tsx` -- becomes a list with click-to-navigate cards
- **Modified**: `src/pages/Dashboard.tsx` -- links to connection detail instead of separate profiles
- **Removed**: Standalone Profiles page (`src/pages/Profiles.tsx`) -- functionality moves into connection detail
- **Modified**: `src/App.tsx` -- routing changes, sidebar updates
- **Modified**: Backend `GET /api/profiles` -- add `target` query param to filter by target URL
