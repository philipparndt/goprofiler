## 1. Preview helpers

- [x] 1.1 Add a `LARGE_VALUE_THRESHOLD` constant (512) at the top of `frontend/src/components/ExpvarMetrics.tsx`.
- [x] 1.2 Add a helper `classifySize(value: unknown): { isLarge: boolean; serializedLength: number }` using `JSON.stringify(value).length`.
- [x] 1.3 Add a helper `buildPreview(value: unknown): string` that returns `{N keys}` / `[N items]` + first ~100 chars for objects/arrays, and `first 100 chars + "…" + "(X.Y KB)"` for long strings.
- [x] 1.4 Add a helper `tryParseJson(value: string): unknown | null` that returns parsed JSON or null on failure.

## 2. Cell rendering

- [x] 2.1 In the value-cell render path, call `classifySize` on each value and memoize the result per row with `useMemo` keyed on the stringified value.
- [x] 2.2 When `isLarge` is true, render the preview string plus an "Expand" icon-button instead of the current inline value. Reuse existing CSS-variable tokens for colors.
- [x] 2.3 When `isLarge` is false, keep the current inline rendering (number / string / expandable map) unchanged.
- [x] 2.4 Ensure the Expand button click does not toggle the existing map row-expand (stopPropagation).

## 3. Modal component

- [x] 3.1 Create `frontend/src/components/ExpvarValueModal.tsx` built on `@radix-ui/react-dialog` primitives (`Root`, `Portal`, `Overlay`, `Content`, `Title`, `Close`).
- [x] 3.2 Props: `{ open: boolean; onOpenChange: (open: boolean) => void; name: string; value: unknown; stale?: boolean }`.
- [x] 3.3 Render the title as the variable name. In the body, if `value` is a string, try `tryParseJson` and pretty-print the parsed result; otherwise pretty-print the value directly with `JSON.stringify(value, null, 2)`. If parsing fails for a string, render the raw string.
- [x] 3.4 Body is a scrollable `<pre>` with monospace font, preserved whitespace, and a max-height that fits within the viewport.
- [x] 3.5 Show a "stale" badge in the header when `stale` is true.
- [x] 3.6 Style the overlay and content with existing CSS variables; ensure z-index sits above `ContextMenu`.

## 4. Modal wiring & state

- [x] 4.1 In `ExpvarMetrics.tsx`, add `const [expandedMetric, setExpandedMetric] = useState<string | null>(null)`.
- [x] 4.2 Expand button sets `expandedMetric` to the metric name; modal `onOpenChange(false)` clears it.
- [x] 4.3 Render a single `<ExpvarValueModal>` at the component root; pass `open = expandedMetric !== null`, `name = expandedMetric`, and `value` looked up from the current metrics snapshot each render so it tracks live poll updates.
- [x] 4.4 Compute `stale` for the modal as `expandedMetric` missing from the latest snapshot, or the panel-wide stale flag.

## 5. Copy-to-clipboard

- [x] 5.1 Add a "Copy" button in the modal header. On click, call `navigator.clipboard.writeText(prettyPrinted)`.
- [x] 5.2 Flip the button label to "Copied" for 1.5 s on success, "Copy failed" for 1.5 s on rejection, then revert.

## 6. Verification

- [x] 6.1 Run `cd frontend && npm run build` and `npm run lint` — build clean; lint introduces no new errors (3 pre-existing `any` warnings in `ExpvarMetrics.tsx` inherited from prior code).
- [ ] 6.2 Manually: start the dev server, connect to a target that publishes a large expvar (or mock one), confirm the preview renders, the modal opens with pretty-printed JSON, live updates flow through, copy works, Escape/backdrop/close dismiss the modal. _(requires user verification)_
- [ ] 6.3 Verify small values (short strings, numbers, small maps) render exactly as before — no regression. _(requires user verification)_
