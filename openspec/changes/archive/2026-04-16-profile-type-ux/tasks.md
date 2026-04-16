## 1. Shared: Profile Type Badge Component

- [x] 1.1 Create a `ProfileTypeBadge` component that renders type badges with record-dot icon (red circle) for CPU and camera icon for snapshot types

## 2. Connections Page: Grouped Profile Type Selector

- [x] 2.1 Redesign profile type selector into two groups: "Record" (CPU) with record icon and "Snapshot" (Heap, Goroutine, Block, Mutex, All) with camera icon
- [x] 2.2 Only show duration input when a recording type is selected

## 3. Profiles Page: New Profile Action

- [x] 3.1 Add green "New Profile" play button to the Profiles page header
- [x] 3.2 Build inline profiling card: target selector dropdown, grouped profile type selector, duration input, Start button, progress bar
- [x] 3.3 Handle empty state (no connected targets) with message and link to Connections
- [x] 3.4 On profile completion, refresh the profiles list and collapse the profiling card

## 4. Profiles List: Badge Update

- [x] 4.1 Replace plain text type badges with `ProfileTypeBadge` component in Profiles list, Dashboard, and profile viewer
