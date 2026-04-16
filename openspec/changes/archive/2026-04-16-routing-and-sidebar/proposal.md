## Why

Two UX problems: (1) The connection detail tabs (Profiling/Monitor) use React state, so reloading the page always jumps back to the Profiling tab. The URL doesn't reflect which tab you're on. (2) The sidebar is static and doesn't show active connections -- you have to navigate to the Connections page to find them. Active connections should be front-and-center in the sidebar with direct links to their Profiling and Monitor views.

## What Changes

- Replace tab state with URL-based routing: `/connections/:id/profiling` and `/connections/:id/monitor`
- Rework the sidebar to show active connections dynamically, each with sub-items for Profiling and Monitor
- Sidebar structure: Dashboard, Connections header, then for each active connection: indented items for Profiling and Monitor
- Reloading any page preserves the exact view

## Capabilities

### New Capabilities
- `url-based-tabs`: Connection detail views use URL routes instead of React state for tab selection
- `dynamic-sidebar`: Sidebar dynamically shows active connections with sub-navigation items

### Modified Capabilities

_None._

## Impact

- **Modified**: `App.tsx` -- new routes for `/connections/:id/profiling` and `/connections/:id/monitor`, dynamic sidebar with connection sub-items
- **Modified**: `ConnectionDetail.tsx` -- read tab from URL param instead of state, remove inline tab bar (handled by sidebar/URL)
- **No backend changes**
