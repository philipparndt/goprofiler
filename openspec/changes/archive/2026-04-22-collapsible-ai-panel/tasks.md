## 1. Collapse state

- [x] 1.1 Added `const [collapsed, setCollapsed] = useState(false)` in `AiAnalysisPanel.tsx`.
- [x] 1.2 Added `const [unread, setUnread] = useState(false)` to track "something happened while collapsed".
- [x] 1.3 Both reset to `false` in the existing `visible` reset effect so a fresh analysis starts expanded with no unread.

## 2. Unread detection

- [x] 2.1 Two effects flag `unread = true` while `collapsed` is true: one on `loading` transitioning to false, one on `error` becoming truthy.
- [x] 2.2 A third effect clears `unread` when `collapsed` flips to false.

## 3. Collapse toggle in the expanded header

- [x] 3.1 Added a `‹` button immediately before the "Close" button with `aria-label="Hide panel (AI keeps running in the background)"` and a matching `title`.
- [x] 3.2 Uses `btn btn-secondary btn-sm` classes so it blends with the other header buttons.
- [x] 3.3 When `collapsed` is true, the main render path short-circuits and returns the new `CollapsedStrip` instead of the full panel.

## 4. Collapsed strip component

- [x] 4.1 Added `CollapsedStrip` in the same file with props `{ loading; hasError; unread; onExpand }`.
- [x] 4.2 Renders as a `<button>` fixed to `right: 0`, 40 px wide, full viewport height, with `background: var(--bg-primary)` + `borderLeft: 1px solid var(--border)` and `z-index: 100` (matches the expanded panel).
- [x] 4.3 Top-to-bottom: status dot (green when `loading`, red when `hasError`, grey otherwise, pulsing only while loading), an optional accent-colored `unread` dot, and a vertical status label (`AI running` / `AI ready` / `AI error`) rendered with `writingMode: vertical-rl` + `rotate(180deg)`.
- [x] 4.4 `aria-label` and `title` reflect the current status plus "click to open".
- [x] 4.5 Native `<button>` handles Enter/Space activation; `onClick={onExpand}` calls the expand handler.

## 5. Styling integration

- [x] 5.1 Only existing CSS variables used (`--bg-primary`, `--border`, `--text-muted`, `--text-primary`, `--success`, `--danger`, `--accent`). No new CSS files.
- [x] 5.2 Reuses the existing `pulse` keyframe on the status dot while `loading`.

## 6. Keep subscription alive across collapse

- [x] 6.1 Verified the `subscribeAIEvents` effect does not depend on `collapsed` — it stays subscribed through the transition.
- [x] 6.2 Event callback still runs unchanged while `collapsed`; `content` / `activity` / `sessionId` continue to update in the background.

## 7. Preserve resize width across cycles

- [x] 7.1 `width` state is untouched by the collapse/expand transition, so re-expanding restores the user's previous width.

## 8. Verification

- [x] 8.1 `cd frontend && npm run build` passes. `npm run lint` reports 3 warnings on this file — the same 3 pre-existing ones as the baseline (no new errors introduced; the new `setState-in-effect` instances I added carry targeted `eslint-disable-next-line` comments, matching the existing pattern in this file).
- [ ] 8.2 Manual: start an analysis, click collapse mid-stream, observe the strip pulsing green. Expand mid-stream — in-progress content is visible and keeps updating. _(requires user verification)_
- [ ] 8.3 Manual: start an analysis, collapse, wait for it to finish, observe the strip indicator goes idle plus the unread dot. Expand — full content visible, unread dot cleared. _(requires user verification)_
- [ ] 8.4 Manual: `pkill claude` while collapsed — strip shows error state and unread. _(requires user verification)_
- [ ] 8.5 Manual: keyboard — tab to the collapsed strip, hit Enter, panel expands. _(requires user verification)_
