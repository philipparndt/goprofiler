## Context

`App.tsx` renders `<aside className="sidebar">` inside the top-level `.app-shell` flex container. The sidebar's width is currently set by `--sidebar-width: 240px` in `index.css`; `App.css` applies both `width` and `min-width` from that variable. The main content area takes the remaining flex space.

There's already a working resize pattern in `AiAnalysisPanel.tsx` — mouse-down on a 6 px strip, document-level `mousemove` / `mouseup` listeners, clamp to `[320, window.innerWidth - 200]`, store width in React state. That pattern works well and we can mirror it.

## Goals / Non-Goals

**Goals:**
- Drag-to-resize on the right edge of the sidebar with visual cursor feedback.
- Clamp to a range that keeps the sidebar usable and the main area non-trivial.
- Persist the user's choice across page reloads without adding a settings endpoint.
- No layout shift on first paint — the persisted width is read before the sidebar mounts so the flex layout settles once.

**Non-Goals:**
- Animating the width. Drag is already smooth; an animated reset could fight the drag.
- A double-click-to-reset handle.
- Touch or keyboard resize.
- A true "collapsed" state (icon-only rail). That's a bigger feature with knock-on design decisions (tooltip-only labels, hide header text, etc.).

## Decisions

### 1. React state for the width, seeded from `localStorage`

Add a `sidebarWidth` state in `App.tsx` (or wherever the `Sidebar` sibling is rendered). Seed it with `parseSavedWidth(localStorage.getItem("goprofiler.sidebarWidth")) ?? 240`. Write back on drag-end (not every mousemove) to avoid thrashing `localStorage`.

### 2. Apply the width via inline style, keep the CSS variable as fallback

In the sidebar's JSX, use `style={{ width: sidebarWidth, minWidth: sidebarWidth }}`. Leave `.sidebar { width: var(--sidebar-width); ... }` in CSS as the baseline so the default is still sensible if JS is delayed or the inline style is stripped by a future refactor.

### 3. Clamp range: `[180, 480]` px

- 180 px is the smallest width where the logo + "GoProfiler" text don't collide and where nav-item labels still fit on one line.
- 480 px keeps the main content usable on a 1280-px viewport (the smallest common laptop width).

If a user wants to go outside that range, they can edit `localStorage` directly — we don't need a settings UI for it.

### 4. Drag handle: 6 px strip on the right edge of the sidebar

Same width/shape as the AI-panel handle. Position `absolute; right: -3px; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 10`. The -3 px offset splits the handle across the border so the user can grab it from either side.

On `mousedown`: capture `startX = e.clientX`, `startWidth = sidebarWidth`, attach document-level `mousemove` and `mouseup`. Set `document.body.style.userSelect = "none"` for the duration so the user doesn't accidentally highlight sidebar text while dragging.

On `mousemove`: `newWidth = clamp(180, 480, startWidth + (e.clientX - startX))`.

On `mouseup`: remove listeners, restore `user-select`, write `localStorage.setItem("goprofiler.sidebarWidth", String(sidebarWidth))`.

### 5. Handle sits inside the sidebar, not across its border

Rendering the handle as a child of `<aside>` with `position: absolute` means `<aside>` needs `position: relative`. That's a one-line CSS tweak with no knock-on effects (sidebar already contains absolutely-positioned context menus via portals elsewhere, so `relative` is safe).

### 6. Read-before-paint for the persisted width

Use a lazy initializer in `useState`:

```ts
const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
  const saved = Number(localStorage.getItem("goprofiler.sidebarWidth"));
  if (Number.isFinite(saved) && saved >= 180 && saved <= 480) return saved;
  return 240;
});
```

That way the sidebar's first render already has the correct width — no 240 → saved-width flash.

## Risks / Trade-offs

- [`localStorage` is unavailable in sandboxed contexts] → The lazy initializer's `try/catch` (or a simple `typeof localStorage !== "undefined"` guard) falls back to 240 px. Acceptable; the sidebar still works.
- [Dragging across iframes or over an element that swallows mouse events could leave the app stuck in drag mode] → Add a `mouseleave` on the window as a safety net, or ensure the listeners are on `document` rather than a specific element (already planned).
- [Clamp range might be wrong for a future 4K layout or a user who wants a huge sidebar] → The range is a pair of constants. Easy to change later. Not in scope to make them configurable.
