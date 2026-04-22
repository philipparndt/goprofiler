## Why

The sidebar is a fixed 240 px (`--sidebar-width` in `index.css`). For users with many saved connections or long pod/target names it's too narrow — names truncate aggressively — while on small screens 240 px eats a disproportionate share of the viewport. The rest of the app already has resizable surfaces (the AI panel uses a drag handle), so users naturally expect the sidebar to behave the same way.

## What Changes

- Add a **drag handle** on the sidebar's right edge. Mouse-down starts a resize; mouse-move updates the sidebar width while the user drags; mouse-up commits the new width.
- Clamp the width to a sensible range (min ≈ 180 px so the logo + labels still fit, max ≈ 480 px so the main content keeps most of the viewport).
- Persist the chosen width to `localStorage` so it survives reloads (and Wails restarts — Wails webview shares a persistent localStorage).
- Keep the current default (240 px) for first-time users.
- The cursor becomes `col-resize` while hovering the handle and while dragging, and the body temporarily gets `user-select: none` during drag so highlighting doesn't fight the motion.

## Capabilities

### New Capabilities
<!-- none — it's a pure UI refinement without its own capability -->

### Modified Capabilities
<!-- none — sidebar layout isn't currently captured in a spec -->

## Impact

- Frontend only: `frontend/src/App.tsx` gains a resize handle + width state; `frontend/src/App.css` moves the sidebar's width from the CSS variable to a style override, keeps the CSS var as the default. No changes to routes, pages, or backend.
- One new piece of persistent client state (`goprofiler.sidebarWidth` in `localStorage`). No schema.
- Non-goals: touch drag, keyboard resize, collapsing the sidebar to an icon rail.
