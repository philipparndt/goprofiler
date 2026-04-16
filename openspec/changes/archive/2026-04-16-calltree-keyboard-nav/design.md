## Context

The call tree renders as a `<table>` with expandable rows. Currently all interaction is mouse-based (click to select, click arrow to expand/collapse). The component tracks `expandedPaths` and `selectedFn` state.

## Goals / Non-Goals

**Goals:**
- Arrow Up/Down moves focus between visible rows
- Arrow Right expands a collapsed node (or moves to first child if already expanded)
- Arrow Left collapses an expanded node (or moves to parent if already collapsed)
- Enter/Space selects the focused row (triggers cross-linking to flame graph)
- Home/End jumps to first/last visible row
- `*` expands all children of the focused node
- Visual focus ring on the focused row

**Non-Goals:**
- Accessibility (ARIA tree role) -- future enhancement
- Multi-select

## Decisions

### 1. Focus index on visible rows array

Maintain a `focusIndex` state that indexes into the flattened list of currently visible rows. Arrow Up/Down decrements/increments the index. This is simpler than tracking focus by path since the visible rows change with expand/collapse.

**Why**: The visible rows are already computed during render. An integer index is trivial to manage and avoids stale path references.

### 2. Keyboard handler on the table container

Attach `onKeyDown` to the scrollable `<div>` wrapping the table, with `tabIndex={0}` to make it focusable. This captures all keyboard events when the call tree area is focused.

**Why**: Single event handler, no per-row listeners needed. Standard pattern for list/tree keyboard navigation.

### 3. Focus styling via outline + background

The focused row gets a `box-shadow: inset 2px 0 0 var(--accent)` left border accent and a subtle background tint, distinct from the selection highlight.

**Why**: Left accent bar is the standard tree-focus pattern. Distinct from selection (which uses `accent-muted` background) so users can see both focus and selection.

## Risks / Trade-offs

- **Scroll into view**: Must auto-scroll the focused row into the visible viewport. Use `scrollIntoView({ block: "nearest" })` on the focused `<tr>`.
