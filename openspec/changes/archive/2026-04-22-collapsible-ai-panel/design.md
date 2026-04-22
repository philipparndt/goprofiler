## Context

`AiAnalysisPanel` (`frontend/src/components/AiAnalysisPanel.tsx`) today has a single visibility knob: `visible` (prop from the parent). `if (!visible) return null` unmounts the whole thing, tearing down:

- the `subscribeAIEvents` subscription (SSE `EventSource` in web mode, Wails `EventsOn` in desktop),
- the `content` / `activity` / `sessionId` / `streamId` state,
- the event-reset effect,
- the permission-level dropdown state (held in parent).

The "Close" button wires through `onClose`, which `api.cancelAnalysis()`s and flips `visible` to false. That's the only way to remove the panel from the viewport today.

Backend-side, after `persistent-claude-session`, the run lives on the `AnalysisService` / `ClaudeSession` and survives the subscription being dropped — the process only dies on `Cancel()` (explicit user action) or the next `StartAnalysis`. So if we keep the subscription alive while collapsed, we lose nothing; if we were to drop it, new events would accumulate server-side until the channel buffer fills, then back-pressure would stall the session. Keeping the subscription alive is clearly the right call.

## Goals / Non-Goals

**Goals:**
- A user-initiated collapse that puts the panel out of the way while the AI keeps producing events.
- Visual signal in the collapsed state that tells the user whether the run is active, done, or errored, with at least a subtle "finished while you were away" cue.
- Full state preservation across collapse/expand cycles: mid-stream text, activity line, session ID, permission level.
- No change to the existing "Cancel" and "Close" semantics.

**Non-Goals:**
- Persisting collapsed state across page reloads or route changes. Navigating off the Profile Viewer / Trace Viewer still unmounts the panel, same as today.
- A general-purpose docked/floating/pinned panel system. This is a two-state toggle.
- Multiple concurrent analyses. Single-active-analysis still holds.
- A detailed preview in the collapsed strip. The strip shows status + a pulse, not a scrolling content snippet.

## Decisions

### 1. Visually collapse, don't unmount

Introduce a new local state `collapsed: boolean` inside `AiAnalysisPanel`. When `collapsed` is true we **still render** the component — we just render a compact strip instead of the full panel. The `useEffect` that owns `subscribeAIEvents` keeps running; its dependencies stay the same (`visible`, `streamId`). Content, activity, sessionId, permission level — all already in component state — continue to update in the background.

Alternative considered: lift state into a context/provider so we could unmount the DOM and still have state. Rejected because it doesn't buy anything (a 30-line CSS-collapsed panel has negligible cost vs. a full-height panel) and adds complexity. The whole point of "visible=false" unmounting today is that there's nothing to preserve when the panel is dismissed.

### 2. Collapsed-strip layout

A fixed-position 40 px-wide vertical strip on the right edge of the viewport, the full height. Content is rotated 90° (vertical text) with:
- A pulse dot at the top (green when running, grey when idle, red when error — same color tokens as today's loading pulse).
- A short status label: "AI running", "AI ready", "AI error". Vertical text so it fits without wrapping.
- An unread indicator (small filled circle) rendered only when the state changed *while* collapsed — cleared on next expand.

Clicking anywhere on the strip calls `setCollapsed(false)`. The strip uses `cursor: pointer` and a subtle hover background change so it reads as clickable.

### 3. Collapse toggle in the expanded header

Add a small `‹` button to the header, immediately to the left of "Close", that sets `collapsed = true`. Tooltip: "Hide panel (the AI keeps running)". The collapsed strip gets a corresponding `›` expand affordance, but since the whole strip is clickable the chevron is mostly decorative.

### 4. "Finished while you were away" cue

Track a ref-held pair `lastSeenLoading`/`lastSeenError` snapshot at the moment of collapse. When `loading` transitions from true → false, or when `error` transitions to non-empty, while `collapsed` is true, set a new local flag `unread = true`. On expand, clear it.

The strip renders a small dot next to the status label when `unread` is true. That's enough — the goal is just "something happened, look at the panel".

### 5. Width / layout interaction

The expanded panel is currently a fixed-width overlay (`position: fixed; right: 0; width: ${width}px`) with a resize handle. The collapsed strip uses the same fixed-position trick but with a fixed width (40 px) and ignores the user's previous resize width (we preserve `width` state for when they re-expand). Switching between the two is a single-state transition — no animation required for v1, but the layout uses plain CSS so a future animation (transition on `width`) is trivial.

### 6. Keyboard and accessibility

- Collapse button: `aria-label="Hide AI panel"`.
- Expand strip: treated as a `<button>` with `aria-label="Show AI panel (running)"` / `"(ready)"` / `"(error)"` based on state. Keyboard: Enter/Space activates, matching default `<button>` behavior.
- Tab order is unchanged in the expanded state. In the collapsed state, the strip is the single focusable element for the panel.

## Risks / Trade-offs

- [The collapsed strip occupies 40 px of the viewport even when the user just wants the panel gone] → That's intentional: the strip is the affordance to reopen, and its width matches other vertical toolbars in similar apps. If a user truly wants the panel gone, "Close" still exists (cancel + unmount). A more aggressive "hide to a tiny corner tab" is out of scope for v1.
- [If the backend crashes while collapsed, the user doesn't see the error as quickly] → The `unread` + red pulse dot mitigates this; final-answer notifications are a nice-to-have we can add later.
- [Re-expanding after a long run leaves the user looking at a wall of text with no scroll cue] → The existing auto-scroll-to-bottom effect still fires as new content arrives, so the user lands at the latest content on expand. No additional UX needed.
- [The strip's rotated text may render inconsistently across platforms] → We use `writing-mode: vertical-rl` which is broadly supported (Chromium, WebKit, Gecko). Safari in WKWebView (Wails) is fine. If we see rendering issues, we can fall back to a horizontal strip with a shorter label like "AI" and no full status word.
