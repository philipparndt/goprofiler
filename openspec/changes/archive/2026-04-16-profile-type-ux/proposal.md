## Why

The profiling controls currently list all profile types (CPU, Heap, Goroutine, Block, Mutex) as flat buttons without distinguishing their nature. CPU profiling requires a recording duration while the others are instant snapshots. This is confusing -- users don't know which types need "recording" vs which are instant captures. Additionally, there's no way to start a new profiling session from the Profiles list page; you have to navigate back to Connections.

## What Changes

- Visually distinguish **recording** profiles (CPU -- requires duration, shows progress) from **snapshot** profiles (Heap, Goroutine, Block, Mutex -- instant capture)
- Add recording/snapshot icons and labels to the profile type selector on the Connections page
- Add a green "New Recording" play button to the Profiles list page that opens a quick-start dialog to select a target and profile type
- Show profile type badges with recording vs snapshot distinction in the profiles list

## Capabilities

### New Capabilities
- `quick-start-profiling`: A "New Recording" action on the Profiles page that lets users start a profiling session without navigating to Connections

### Modified Capabilities
- `profile-collection`: Visual distinction between recording (CPU) and snapshot (Heap/Goroutine/Block/Mutex) profile types in the UI

## Impact

- **Modified**: Frontend Connections page -- redesign profile type selector with recording/snapshot grouping
- **Modified**: Frontend Profiles page -- add "New Recording" button with target/type selection dialog
- **Modified**: Frontend profile type badges -- add icons distinguishing recording vs snapshot
- **No backend changes** -- all existing APIs support this already
