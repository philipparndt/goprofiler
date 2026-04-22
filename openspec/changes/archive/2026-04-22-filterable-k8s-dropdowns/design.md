## Context

`frontend/src/components/K8sConnectWizard.tsx` (~260 lines) owns the whole k8s connect flow. It uses its own inline `CustomDropdown` component for both the context and namespace pickers. The dropdown is a plain button + absolute-positioned popover:

- No search input.
- Options are a flat `<div>` list.
- Closes on item click or backdrop click.

State flow on context change (roughly, lines 47–49):

```ts
const changeContext = async (ctx: string) => {
  setSelectedCtx(ctx);
  await discover(ctx, "", search);
};
```

`discover()` sets a single `loading` boolean around the `api.discoverK8s` call. The only visible effect of `loading` is the search button's text going to `"..."` — the pod list stays as the previous cluster's pods (stale), with no indication that work is happening.

## Goals / Non-Goals

**Goals:**
- A fast client-side filter on both dropdowns that's out of the way when the list is short.
- An obvious loading state while the wizard is re-fetching after a context (or namespace) change.
- Keep the wizard's existing DOM layout and focus behavior. No global design system churn.

**Non-Goals:**
- Fuzzy matching, typo tolerance, or recency ranking.
- Virtualization of long lists — plain filtering is enough for the scale users hit.
- Persisting last-selected context / namespace across sessions.
- Replacing the custom dropdown with a third-party component. Radix Select is in the repo but swapping in a library here is more churn than the problem warrants.

## Decisions

### 1. Extend the existing `CustomDropdown`, don't fork it

Add three new optional props:

- `searchable?: boolean` — when true, render a text input at the top of the popover.
- `searchThreshold?: number` — render the search input only when `options.length >= searchThreshold`. Default 6. This keeps tiny dropdowns (e.g. a cluster with 3 contexts) clean.
- `searchPlaceholder?: string` — e.g. "Filter contexts…".

Filtering is local to the dropdown: it holds a `query` state, resets it when the popover opens, filters options by case-insensitive substring match on the option's displayed label. Unchanged dropdowns (any caller that doesn't pass `searchable`) behave exactly as today.

The currently-selected option appears at the top of the filtered list even when it doesn't match the query — this prevents the UI confusing users when they type and their current pick visually disappears.

### 2. Auto-focus the search input when open

When the popover opens and the search input is rendered, focus it so the user can type immediately. Escape closes the popover (existing behavior). Arrow keys cycle through filtered options (nice-to-have; defer to v2 if adds complexity — keyboard nav wasn't there before).

### 3. A wizard-level `refreshing` flag distinct from `loading`

Today there's a single `loading` boolean covering the initial mount, context change, namespace change, and search button. Introduce a second boolean `refreshing` that's true only while a `discover()` call is in flight *after* the initial load (i.e. on context change, namespace change, or manual search). Keep the existing `loading` for the first-mount case that renders the full-screen "Connecting to Kubernetes…" spinner.

- When `refreshing` is true: render a small inline spinner in the pods list area with a single-line caption ("Loading from cluster…"). Keep the context/namespace dropdowns enabled and their current selection visible.
- The search button text (`"..."`) can continue to reflect `loading || refreshing` — that's already a reasonable indicator.

### 4. Keep the UI responsive while refreshing

The dropdowns stay enabled during refresh. If the user picks a different context mid-refresh, the wizard fires a new `discover()` and the in-flight one is essentially a wasted trip. That's acceptable — the next response's data overwrites state. We don't need to abort; the cost is a few KB of JSON.

If this becomes a problem (flaky networks, slow kubectl calls), we can add an `AbortController` per discover call later. Not in scope.

### 5. Visual treatment

Reuse existing CSS variables. The search input is a plain `.input` element (matches the rest of the app). The inline spinner is a 16-px rotating border, same as the one already present in `K8sConnectWizard` lines 76–85 just sized smaller. No new CSS files.

## Risks / Trade-offs

- [The search input state reset each popover open loses typing when the user closes-then-reopens] → Intentional: reopening often means "I want a fresh pick" and a stale query would be confusing. If users report that as a regression we can keep `query` per-popover-instance.
- [Auto-focusing the input means a click no longer auto-highlights the first option for keyboard `Enter` selection] → Accepted; keyboard selection wasn't wired up before this change either. If we add arrow-key nav later, we'll reintroduce that explicitly.
- [The threshold default (6) is a guess] → Configurable per callsite. If real usage shows the dropdown always has ≥3 options, we can lower it or drop the threshold entirely.
- [Selected-but-filtered-out option pinned at top could confuse some users] → We'll render it with a subtle divider so it's visually separated from the filtered matches, and label unambiguously (e.g. `selected: my-context`).
