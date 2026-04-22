## 1. State + persistence helpers

- [x] 1.1 Added module-scope constants in `frontend/src/App.tsx`: `MIN_SIDEBAR = 180`, `MAX_SIDEBAR = 480`, `DEFAULT_SIDEBAR = 240`, `SIDEBAR_STORAGE_KEY = "goprofiler.sidebarWidth"`.
- [x] 1.2 `Sidebar` now seeds `const [sidebarWidth, setSidebarWidth] = useState<number>(() => readSavedSidebarWidth())` so the first paint uses the persisted width.
- [x] 1.3 Added `readSavedSidebarWidth()` and `saveSidebarWidth()` at module scope; both wrapped in `try/catch` so a broken or sandboxed `localStorage` degrades to the default without crashing.

## 2. Render the sidebar with the dynamic width

- [x] 2.1 `<aside className="sidebar">` now carries inline `style={{ width: sidebarWidth, minWidth: sidebarWidth }}`.
- [x] 2.2 `.sidebar` in `App.css` gained `position: relative` (so the absolutely-positioned handle anchors correctly). The existing `width: var(--sidebar-width)` stays as the baseline fallback.

## 3. Drag handle

- [x] 3.1 Handle rendered as a child of `<aside>`: `position: absolute; right: -3px; top: 0; height: 100%; width: 6px; cursor: col-resize; z-index: 10; background: transparent`. Also carries `role="separator"`, `aria-orientation="vertical"`, `aria-label="Resize sidebar"`.
- [x] 3.2 `handleResizeStart` preventDefaults, captures `startX` + `startWidth`, attaches document-level `mousemove`/`mouseup`, sets `document.body.style.userSelect = "none"` for the duration, restores the previous value on `mouseup`.
- [x] 3.3 `mousemove` computes `Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, startWidth + deltaX))` and calls `setSidebarWidth`.
- [x] 3.4 `mouseup` persists the latest width via `saveSidebarWidth(latest)` and tears down the listeners.

## 4. Persistence on drag-end

- [x] 4.1 `saveSidebarWidth` writes to `localStorage` only from the `mouseup` path — `mousemove` updates React state only, so storage isn't thrashed.

## 5. Cleanup + safety

- [x] 5.1 `handleResizeStart` is a `useCallback` with `sidebarWidth` in the dep array, so `startWidth` always captures the current value.
- [x] 5.2 A `dragging` ref guards against double-start and double-teardown, and `prevUserSelect` is restored exactly once.

## 6. Verification

- [x] 6.1 `cd frontend && npm run build` passes. `npm run lint` shows only pre-existing warnings on `App.tsx` (exports from a component file, and a long-standing empty-catch); no new lint errors introduced by this change.
- [ ] 6.2 Manual: drag the handle; the sidebar resizes in real time, nav labels stay legible throughout the clamp range. _(requires user verification)_
- [ ] 6.3 Manual: drag far left / far right; the width stops at 180 / 480 respectively. _(requires user verification)_
- [ ] 6.4 Manual: reload; the sidebar opens at the last-saved width. _(requires user verification)_
- [ ] 6.5 Manual: clear `localStorage`; sidebar opens at 240 px default. _(requires user verification)_
- [ ] 6.6 Manual: set `goprofiler.sidebarWidth` to `"abc"` in devtools; reload → sidebar uses 240 (fallback triggers). _(requires user verification)_
