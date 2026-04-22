## Why

The k8s connection wizard shows every Kubernetes context and namespace as a flat list in a custom popover. For users with lots of clusters (50+ contexts is common across internal/prod/dev environments) the list is unusable — they scroll for seconds to find the right one. The same applies to namespaces: clusters with 30+ namespaces make the popover a wall of text. On top of that, when the user picks a new context, the wizard re-fetches namespaces and pods but shows no visible progress — to the user it just looks frozen for several seconds while kubeconfig + the cluster are contacted. Both problems are easy to fix in the wizard without backend changes.

## What Changes

- Add a **search input** at the top of the contexts dropdown (shown only when the list is long enough to benefit — say, more than 5 entries). Typing filters the visible options client-side by case-insensitive substring match against the context name. The currently-selected value remains visible at the top of the filtered list even if it doesn't match.
- Same treatment for the **namespaces dropdown**, same threshold, same match semantics.
- Show a **loading spinner** on the wizard while a context change is in flight (triggered when the user picks a new context, which causes a `discoverK8s` re-fetch that can take multi-second round-trips). The spinner appears where the pod list would render, replacing the list until the new data arrives. The context and namespace dropdowns remain interactive so the user can refine their selection while waiting.
- Selected context/namespace labels stay visible on the wizard while loading — no flicker/blank state during re-fetch.

## Capabilities

### New Capabilities
- `k8s-connection`: the Kubernetes-target connection wizard, its context/namespace pickers, and its in-flight loading behavior.

### Modified Capabilities
<!-- none — new capability -->

## Impact

- Frontend only: `frontend/src/components/K8sConnectWizard.tsx` gets a search-capable `CustomDropdown` (or a second component) and a new loading-state render branch. No changes to `api.ts`, no backend changes.
- No new dependencies.
- Non-goals: fuzzy matching, pinned favorites, remembering the last-selected context across sessions.
