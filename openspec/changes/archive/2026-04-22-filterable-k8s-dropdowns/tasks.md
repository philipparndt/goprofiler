## 1. CustomDropdown: add filter props

- [x] 1.1 Extended the inline `CustomDropdown` with optional props `searchable?: boolean`, `searchThreshold?: number` (default 6), and `searchPlaceholder?: string`.
- [x] 1.2 New `query` state resets to `""` each time the popover transitions from closed to open (effect keyed on `open`).
- [x] 1.3 `showSearch = !!searchable && options.length >= (searchThreshold ?? 6)`.
- [x] 1.4 `matches` is case-insensitive substring-filter of `options` by label. Pinned selected option is computed separately when it would be filtered out.
- [x] 1.5 A Radix-free `<input className="input">` is rendered at the top of the popover when `showSearch` is true, auto-focused on open via a ref + deferred `setTimeout(focus, 0)`.
- [x] 1.6 Pinned-selected option renders above filtered matches with a 1-px `var(--border)` divider underneath.

## 2. Context and namespace pickers use the filter

- [x] 2.1 Context dropdown call-site receives `searchable` and `searchPlaceholder="Filter contexts…"`.
- [x] 2.2 Namespace dropdown call-site receives `searchable` and `searchPlaceholder="Filter namespaces…"`.

## 3. Wizard refreshing state

- [x] 3.1 New `refreshing` boolean set at the start of `discover()` *only* when `hasDataRef.current` is already true (tracked via a ref). `loading` is set for the first call.
- [x] 3.2 The full-screen "Connecting to Kubernetes…" spinner keeps firing on first mount (unchanged).
- [x] 3.3 When `refreshing` is true, the pods list area is replaced by a centered 16-px rotating spinner with caption "Loading from cluster…". Context/namespace dropdowns stay rendered and interactive above.

## 4. Styling

- [x] 4.1 Reuses existing CSS variables (`--bg-primary`, `--border`, `--text-muted`, `--text-primary`, `--accent`, `--accent-muted`, `--bg-hover`, `--bg-surface`). No new CSS files.
- [x] 4.2 The inline spinner uses the same `spin 0.8s linear infinite` keyframe as the full-screen version, sized at 16 px.

## 5. Accessibility

- [x] 5.1 Search input: `aria-label` mirrors the placeholder ("Filter contexts" / "Filter namespaces").
- [x] 5.2 Escape inside the search input closes the popover (new explicit `onKeyDown` handler — previously depended only on backdrop click).
- [x] 5.3 Pinned-selected option renders with `aria-current="true"` via the shared `OptionRow` helper.

## 6. Verification

- [x] 6.1 `cd frontend && npm run build` passes. `npm run lint` reports the same pre-existing warnings as before; the one new `setState-in-effect` line carries a targeted `eslint-disable-next-line` matching the existing pattern in this file.
- [ ] 6.2 Manual, many contexts: search input shows, typing filters live, selected-but-filtered-out option pinned at top, picking an option closes the popover and fires `onChange`. _(requires user verification)_
- [ ] 6.3 Manual, few contexts (<6): no search input renders. _(requires user verification)_
- [ ] 6.4 Manual, change context: inline spinner + "Loading from cluster…" replaces the pods list, dropdowns remain interactive, spinner clears on response. _(requires user verification)_
- [ ] 6.5 Manual, change namespace: same refreshing indicator. _(requires user verification)_
- [ ] 6.6 Manual, mount fresh: full-screen "Connecting to Kubernetes…" still fires (unchanged). _(requires user verification)_
