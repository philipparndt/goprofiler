## Why

Power users navigating large call trees need keyboard shortcuts to move through the tree quickly without reaching for the mouse. Profiling tools like JProfiler and IntelliJ support full keyboard navigation (arrow keys to move, expand, collapse) which makes exploration fast and ergonomic. Currently the call tree is mouse-only.

## What Changes

- Add keyboard navigation to the call tree: arrow keys to move focus between rows, left/right to collapse/expand, Enter to select
- Visual focus indicator on the currently focused row
- Home/End to jump to first/last visible row
- Expand all / Collapse all keyboard shortcuts

## Capabilities

### New Capabilities
- `calltree-keyboard-nav`: Full keyboard navigation for the call tree with focus management, expand/collapse, and selection

### Modified Capabilities

_None._

## Impact

- **Modified**: Frontend `CallTree` component in `ProfileViewer.tsx` -- add keyboard event handling, focus state, and visual focus indicator
- **No backend changes**
