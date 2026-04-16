## Context

Currently `App.tsx` has routes for `/connections/:id` and `ConnectionDetail.tsx` uses `useState<DetailTab>("profiling")` for the Profiling/Monitor tabs. The sidebar is fully static -- Dashboard, Connections, Setup.

## Goals / Non-Goals

**Goals:**
- URL reflects the active view: `/connections/:id/profiling`, `/connections/:id/monitor`
- Page reload preserves exact view
- Sidebar shows active connections with Profiling/Monitor sub-items
- Sub-items highlight correctly based on current URL

**Non-Goals:**
- Nested layouts with React Router outlets (keep it simple -- single component reads URL param)
- Sidebar collapse/expand animation

## Decisions

### 1. Route structure: `/connections/:id/:tab`

Add routes:
- `/connections/:id` -> redirect to `/connections/:id/profiling`
- `/connections/:id/profiling` -> ConnectionDetail with tab=profiling
- `/connections/:id/monitor` -> ConnectionDetail with tab=monitor

ConnectionDetail reads `:tab` from URL params instead of useState.

**Why**: Standard URL-based routing. Bookmarkable, reload-safe, shareable.

### 2. Dynamic sidebar with connection sub-items

The sidebar polls active targets (or receives them via context). Below the static "Connections" link, each active connection is shown as a group with its URL (truncated) and two indented sub-items: Profiling and Monitor. Uses `NavLink` for active state highlighting.

Layout:
```
Dashboard
Connections
  localhost:6060
    Profiling
    Monitor
  other-host:6060
    Profiling
    Monitor
Setup
```

**Why**: Direct access to any connection's view from anywhere in the app. The sidebar becomes the primary navigation for the connection-centric workflow.

### 3. Sidebar fetches targets via polling

The sidebar fetches `GET /api/targets` every 5 seconds to keep the connection list current. This is lightweight (already being done on other pages).

**Why**: Simple, no shared state management needed. The API call is fast.

## Risks / Trade-offs

- **Many active connections** -> Sidebar could get long. Mitigated by truncating URLs and scrollable nav area. Not a concern for typical use (1-3 connections).
