## ADDED Requirements

### Requirement: The context picker SHALL support typeahead filtering when the list is long

When the user opens the context dropdown in the k8s connection wizard and the number of available contexts is at or above a configured threshold, the dropdown MUST render a search input at the top that filters the visible options by case-insensitive substring match against the context name.

#### Scenario: Search input appears for long context lists
- **WHEN** the user opens the context dropdown and the number of contexts is ≥ the threshold (default 6)
- **THEN** a text input is rendered at the top of the popover, focused by default, with a descriptive placeholder such as "Filter contexts…".

#### Scenario: Search input hidden for short lists
- **WHEN** the user opens the context dropdown and the number of contexts is below the threshold
- **THEN** no search input is rendered and the options list looks exactly as before.

#### Scenario: Filtering narrows the list
- **WHEN** the user types into the search input
- **THEN** only options whose label contains the query (case-insensitive) are shown
- **AND** the currently-selected option remains visible at the top of the list even if it does not match, with a visual separation from the matches.

#### Scenario: Selecting an option closes the popover and clears the query
- **WHEN** the user selects an option
- **THEN** the popover closes and the search query is discarded so reopening the popover starts with an empty query.

### Requirement: The namespace picker SHALL support the same typeahead filter

The namespace dropdown MUST use the same filtering behavior and threshold as the context dropdown so the two pickers are consistent.

#### Scenario: Namespace filter mirrors context filter
- **WHEN** the user opens the namespace dropdown and the namespace list length is ≥ the threshold
- **THEN** a search input is rendered, focused, and filters the visible namespaces by case-insensitive substring match exactly like the context picker.

### Requirement: The wizard SHALL indicate that it is fetching after a context or namespace change

When the user changes the active context or namespace, the subsequent cluster discovery call can take several seconds. The wizard MUST render an obvious in-flight indicator during this time so the user is not confused by stale data sitting in the pods list.

#### Scenario: Inline spinner while refreshing after a context change
- **WHEN** the user picks a different context and the wizard is awaiting the discovery response
- **THEN** the pod list area is replaced by a small spinner with a caption such as "Loading from cluster…"
- **AND** the context and namespace dropdowns remain enabled and show their current selection.

#### Scenario: Inline spinner while refreshing after a namespace change
- **WHEN** the user picks a different namespace and the wizard is awaiting the discovery response
- **THEN** the same in-flight indicator is rendered.

#### Scenario: Indicator clears on completion
- **WHEN** the discovery response arrives (success or error)
- **THEN** the spinner is removed and the pod list is rendered (or an error message is shown) with the new cluster's data.

### Requirement: The initial "Connecting to Kubernetes…" indicator SHALL remain the entry screen

The first-mount loading state MUST remain a full-wizard indicator, not be replaced with the smaller inline spinner. The two states serve different purposes: the big one says "the wizard is still starting up"; the small one says "the wizard is refreshing data."

#### Scenario: Initial mount shows the big indicator
- **WHEN** the wizard mounts for the first time and hasn't yet received any data
- **THEN** a full-wizard spinner with the caption "Connecting to Kubernetes…" is shown, as it is today.
