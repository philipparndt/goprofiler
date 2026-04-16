## Context

Currently the app has 4 top-level pages: Dashboard, Connections, Profiles, Setup. Connections and Profiles are separate -- you connect on one page, profile results appear on another. This creates a disjointed workflow. The user wants a connection-centric model where you drill into a connection and do everything (profile, view results) from there.

## Goals / Non-Goals

**Goals:**
- Single connection detail page with: status, profiling controls, profiles list
- No need to navigate between pages during a profiling workflow
- Connections list as the primary entry point
- Dashboard as a quick overview with shortcuts into connection details

**Non-Goals:**
- Cross-connection profile comparison (keep existing diff via direct URL)
- Removing profile viewer page (it stays at `/profiles/:id` for viewing flame graphs / call trees)

## Decisions

### 1. Route structure: `/connections/:id`

The connection detail page lives at `/connections/:id`. The connections list stays at `/connections`. Profile viewer stays at `/profiles/:id` (linked from the connection detail's profiles table).

**Why**: Clean URL structure. Connection ID is already a UUID in the backend. Deep-linkable.

### 2. Connection detail page layout

Top section: connection status bar (URL, status dot, disconnect button).
Middle section: profiling controls (same grouped Record/Snapshot selector from current TargetCard).
Bottom section: profiles table filtered to this target, with View/Export/Delete actions.

**Why**: Everything in one scrollable page. No tabs needed -- all three sections are visible at once.

### 3. Backend: filter profiles by target URL

Add `target` query param to `GET /api/profiles?target=<url>`. The storage layer already has `target_url` in the profiles table.

**Why**: Minimal backend change. The connection detail page needs to show only profiles from that target.

### 4. Remove standalone Profiles page

The sidebar drops the "Profiles" link. All profile browsing happens within a connection detail. The profile viewer (`/profiles/:id`) remains accessible via links.

**Why**: Eliminates the fragmented navigation. Users always see profiles in context of their connection.

### 5. Connections list becomes card-based with navigation

Each connection in the list is a clickable card that navigates to `/connections/:id`. Shows URL, status, profile count, last profile timestamp.

**Why**: The list is the entry point. Cards give enough info to pick the right connection.

## Risks / Trade-offs

- **Losing global profiles view** -> Users who want to see all profiles across connections lose that view. Mitigated by the Dashboard showing recent profiles across all connections.
- **Saved connections** -> Saved (disconnected) targets can still be shown in the connections list with a "Reconnect" action. Their profiles remain viewable.
