# app-navigation Specification

## Purpose
TBD - created by archiving change resizable-sidebar. Update Purpose after archive.
## Requirements
### Requirement: The sidebar SHALL support drag-to-resize from its right edge

The application sidebar MUST expose a draggable handle along its right edge. Mouse-down on the handle followed by pointer motion MUST update the sidebar's rendered width in real time; mouse-up MUST commit the new width.

#### Scenario: User drags the handle to widen the sidebar
- **WHEN** the user presses the mouse on the sidebar's right-edge handle and drags the pointer to the right
- **THEN** the sidebar's rendered width grows proportionally in real time, keeping pace with the pointer.

#### Scenario: User drags the handle to narrow the sidebar
- **WHEN** the user presses the mouse on the handle and drags to the left
- **THEN** the sidebar's rendered width shrinks proportionally in real time.

#### Scenario: Pointer leaves the sidebar during drag
- **WHEN** the user's pointer moves outside the sidebar while still dragging
- **THEN** resize continues to track the pointer (document-level listeners, not sidebar-scoped).

### Requirement: The sidebar width SHALL be clamped to a usable range

The sidebar's resolved width MUST be clamped between a minimum (small enough for a desktop layout but big enough that the logo and navigation labels fit without wrapping) and a maximum (large enough to accommodate long labels but not so large that the main content area becomes unusable on a typical laptop viewport).

#### Scenario: Dragging below the minimum
- **WHEN** the user drags the handle far to the left so the implied width falls below the minimum
- **THEN** the sidebar's width is held at the minimum.

#### Scenario: Dragging above the maximum
- **WHEN** the user drags the handle far to the right so the implied width exceeds the maximum
- **THEN** the sidebar's width is held at the maximum.

### Requirement: The chosen sidebar width SHALL persist across reloads

Once the user has resized the sidebar, subsequent loads of the application (tab refresh, Wails restart) MUST open the sidebar at the user's last chosen width rather than at the default.

#### Scenario: Width restored on next load
- **WHEN** the user has resized the sidebar and the application is reloaded
- **THEN** the sidebar opens at the previously set width (subject to the clamp).

#### Scenario: First-time user
- **WHEN** no previously-saved width exists
- **THEN** the sidebar opens at the application's default width.

#### Scenario: Corrupted or out-of-range saved width
- **WHEN** the persisted width is not a number or is outside the clamp range
- **THEN** the saved value is ignored and the default width is used.

### Requirement: The drag interaction SHALL give clear pointer feedback

The resize handle MUST communicate its interactive affordance through cursor state, and active dragging MUST not interfere with the user's ability to target the handle (e.g. via accidental text selection).

#### Scenario: Hovering the handle
- **WHEN** the user's pointer hovers the sidebar's resize handle
- **THEN** the cursor changes to `col-resize`.

#### Scenario: Active drag suppresses text selection
- **WHEN** the user is actively dragging the handle
- **THEN** document text selection is suppressed for the duration of the drag, so the user does not accidentally highlight sidebar content.

