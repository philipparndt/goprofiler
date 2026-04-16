## 1. URL-Based Routing

- [x] 1.1 Add routes in App.tsx: `/connections/:id/profiling`, `/connections/:id/monitor`, and redirect `/connections/:id` to `/connections/:id/profiling`
- [x] 1.2 Update ConnectionDetail to read `:tab` from URL params instead of useState, remove inline tab bar buttons

## 2. Dynamic Sidebar

- [x] 2.1 Extract sidebar into its own component that polls active targets every 5 seconds
- [x] 2.2 Render active connections below the Connections link with status dot, truncated URL, and indented Profiling/Monitor NavLinks
- [x] 2.3 Ensure NavLink active state works correctly for connection sub-items (match `/connections/:id/profiling` etc.)

## 3. Navigation Updates

- [x] 3.1 Update all internal links that navigate to connection detail (Connections page cards, Dashboard cards) to use `/connections/:id/profiling`
- [x] 3.2 Remove the tab switching buttons from ConnectionDetail header area (sidebar handles navigation now)
