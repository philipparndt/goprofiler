## ADDED Requirements

### Requirement: Large expvar values SHALL render as a preview with an explicit expand affordance

When a variable's value, after JSON serialization, exceeds the configured large-value threshold (default 512 characters), the panel MUST render a compact preview in the table cell instead of the full value, and MUST render an "Expand" control next to the preview that opens a modal with the full value.

#### Scenario: Small value renders unchanged
- **WHEN** a variable's serialized value is at or below the threshold
- **THEN** the cell renders the value using the existing inline formatting (number, string, or expandable map) and no expand control is shown.

#### Scenario: Long object value renders as preview
- **WHEN** a variable's value is an object/array whose serialized length exceeds the threshold
- **THEN** the cell renders a summary header (`{N keys}` for objects, `[N items]` for arrays) followed by a truncated stringified preview ending in an ellipsis
- **AND** an expand control is rendered in the same cell.

#### Scenario: Long string value renders as preview
- **WHEN** a variable's value is a string whose length exceeds the threshold
- **THEN** the cell renders the first ~100 characters followed by an ellipsis and a size indicator (e.g. `(2.1 KB)`)
- **AND** an expand control is rendered in the same cell.

#### Scenario: Stringified JSON inside a string value is treated as large when oversize
- **WHEN** a variable's value is a string that contains parseable JSON and whose length exceeds the threshold
- **THEN** the cell behavior is the same as any other long string (preview + expand control).

### Requirement: Expand control SHALL open a modal that pretty-prints the full value

Clicking the expand control MUST open a modal dialog that displays the full value pretty-printed as indented JSON in a scrollable, monospace region. The modal MUST be dismissible via a close button, the Escape key, or clicking the backdrop.

#### Scenario: Opening the modal
- **WHEN** the user clicks the expand control for a variable
- **THEN** a modal opens showing the variable name as the title and the full value pretty-printed (2-space indent) in a scrollable region.

#### Scenario: Value is a stringified JSON document
- **WHEN** the value is a string that parses as valid JSON
- **THEN** the modal pretty-prints the parsed value rather than the raw string.

#### Scenario: Value is a non-JSON string
- **WHEN** the value is a string that does not parse as JSON
- **THEN** the modal displays the raw string content preserved as-is in the scrollable region.

#### Scenario: Dismissing the modal
- **WHEN** the user presses Escape, clicks the close button, or clicks outside the modal content
- **THEN** the modal closes and focus returns to the expand control that opened it.

### Requirement: The modal SHALL remain stable across polling updates

The expvar panel polls the backend on a fixed interval. When the modal is open, subsequent poll cycles MUST NOT close, remount, or visually flicker the modal.

#### Scenario: Poll completes while modal is open
- **WHEN** a poll cycle completes and returns updated metrics while the modal is open
- **THEN** the modal remains open.

#### Scenario: Value updates while modal is open
- **WHEN** the displayed variable's value changes between polls while the modal is open
- **THEN** the modal content updates to reflect the latest value without closing or losing scroll position reset expectations (scroll position is preserved).

#### Scenario: Variable disappears while modal is open
- **WHEN** the variable being displayed in the modal is no longer present in the latest poll
- **THEN** the modal shows the last-known value with a clearly visible "stale" indicator and remains open until the user dismisses it.

### Requirement: The modal SHALL offer copy-to-clipboard for the displayed content

The modal MUST provide a button that copies the currently displayed (pretty-printed) content to the system clipboard and MUST give the user transient visual confirmation that the copy succeeded.

#### Scenario: Successful copy
- **WHEN** the user clicks the copy button
- **THEN** the pretty-printed content is written to the clipboard
- **AND** the button briefly indicates success (e.g. changes label to "Copied" for ~1.5 s) before reverting.

#### Scenario: Clipboard write fails
- **WHEN** the browser denies clipboard access or the write throws
- **THEN** the button briefly indicates failure (e.g. "Copy failed") and the modal remains open.
