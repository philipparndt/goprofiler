## Context

The expvar panel (`frontend/src/components/ExpvarMetrics.tsx`) renders `/debug/vars` output in a table with columns Name / Type / Value / Trend. Values are classified into `number | string | map | raw`. Nested maps are partially handled (expandable rows showing `{N keys}` when collapsed), but:

- String values are printed in full regardless of length.
- `raw` values (arrays, deeply nested objects, anything not a plain map) are `JSON.stringify`'d into the cell.
- Some targets publish payloads that are 1–100 KB of JSON per variable (build info, full config dumps, cache snapshots), which breaks the table layout and makes the panel unusable.

Constraints:
- React 19 + TypeScript, Vite, CSS variables for theming.
- `@radix-ui/react-dialog` is already a dependency but unused — preferred for the modal.
- The panel polls every 2 s; the modal must not tear down/re-render on each poll while open.
- No backend changes desired — all classification happens client-side.

## Goals / Non-Goals

**Goals:**
- Keep small/simple values rendered inline exactly as today (no regression).
- Detect large values deterministically and render a short preview in the cell.
- Provide a modal with pretty-printed, scrollable JSON and copy-to-clipboard.
- Modal remains stable (doesn't close/flicker) across poll cycles.

**Non-Goals:**
- Search, filter, or diff inside the modal.
- Syntax-highlighted JSON (plain `<pre>` with indentation is sufficient for v1).
- Server-side truncation or streaming — the existing 10 MB fetch cap is fine.
- Changing the existing expandable-map behavior for small maps.

## Decisions

### 1. Size threshold based on serialized length, not semantic depth

Use `JSON.stringify(value).length > LARGE_VALUE_THRESHOLD` (proposed: **512 chars**). Simple, predictable, covers arrays, deep objects, and long strings uniformly. Alternative considered: depth + key-count heuristic — rejected because it needs two thresholds and still misses long flat strings.

Stringified JSON inside a `string` value (e.g. `"{\"a\":1,...}"`) is also treated as large once its length passes the threshold; we attempt `JSON.parse` on preview/modal open so the modal pretty-prints it.

### 2. Preview format

- Objects/arrays: `{N keys}` / `[N items]` followed by the first ~100 chars of the stringified value with an ellipsis.
- Long strings: first ~100 chars + `…` + total-length badge (e.g. `(2.1 KB)`).

A small "Expand" icon-button in the cell is the click target for opening the modal (rather than the whole row, to avoid conflicting with the existing map expand-on-row-click).

### 3. Modal built on Radix Dialog

Use `@radix-ui/react-dialog` primitives (`Root`, `Portal`, `Overlay`, `Content`, `Title`, `Close`). Reasons: already installed, handles focus-trap / esc / aria correctly, portal keeps it above the context menu z-stack. Alternative: a hand-rolled modal like `ContextMenu.tsx` — rejected because focus management and a11y are non-trivial.

### 4. Modal stability across polls

Modal open state lives in `ExpvarMetrics` keyed by metric name (`const [expandedMetric, setExpandedMetric] = useState<string | null>(null)`). The modal reads the latest value from the current metrics snapshot on every render — so the user sees live updates while the modal is open, but the modal itself doesn't remount. Copy-to-clipboard copies whatever the modal is currently showing.

### 5. Preview computation location

Compute preview + `isLarge` inline in the render path (cheap for expvar-sized payloads, runs every 2 s). Memoize per-row with `useMemo` keyed on the stringified value to avoid re-stringifying unchanged rows. Do not pre-compute in the fetch layer — keeps classification colocated with rendering.

## Risks / Trade-offs

- [Very large payloads near the 10 MB fetch cap could make `JSON.stringify` / `JSON.parse` noticeable on each poll] → Memoize by reference; if profiling shows a hotspot, cache by metric name + a cheap hash. Not a day-1 concern at expected sizes.
- [Pretty-printing a 1 MB JSON in the modal may briefly jank the main thread] → Acceptable for v1; the action is user-initiated and one-shot. Can move to a worker later if reports come in.
- [Threshold of 512 chars is a judgment call] → Make it a `const` at the top of the file so it's trivially tunable. No user-facing setting in v1.
- [String values that *look* like JSON but aren't parseable] → `JSON.parse` in a try/catch; on failure, show the raw string in the modal (still pretty-useful because it's scrollable).
