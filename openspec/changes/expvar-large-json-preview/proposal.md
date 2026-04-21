## Why

The expvar panel renders every variable's value inline in a table. Some targets publish large JSON documents (nested maps, arrays, or stringified payloads) as single expvar entries. Today these either flood the row (unreadable) or, for deeply nested maps, collapse to `{N keys}` with no way to see the content. Operators need to inspect the full payload without leaving the page or opening devtools.

## What Changes

- Detect "large" expvar values (JSON objects/arrays exceeding a size or depth threshold, and string values containing parseable JSON over a length threshold).
- Render a compact preview in the table cell (e.g. first ~120 chars with an ellipsis, or a `{N keys, M entries}` summary) with a clickable affordance.
- On click, open a modal that pretty-prints the full value (indented JSON, monospace, scrollable) with copy-to-clipboard.
- Keep the existing inline rendering for small/simple values — the modal is only for large payloads.

## Capabilities

### New Capabilities
- `expvar-metrics`: Displaying and inspecting `/debug/vars` data in the profiler UI, including the preview + modal behavior for large JSON values.

### Modified Capabilities
<!-- none -->

## Impact

- Frontend only: `frontend/src/components/ExpvarMetrics.tsx` gains preview logic and a new modal component (built on the already-installed `@radix-ui/react-dialog`).
- No backend, API, or data-shape changes.
- No new dependencies.
