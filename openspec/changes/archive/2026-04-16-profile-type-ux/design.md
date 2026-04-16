## Context

Currently the Connections page has a flat row of buttons for all profile types. CPU is the only type that requires a duration -- it's a "recording". Heap, Goroutine, Block, and Mutex are instant point-in-time snapshots. The UI doesn't communicate this distinction.

The Profiles list page shows collected profiles but has no action to start a new one -- users must go to Connections first.

## Goals / Non-Goals

**Goals:**
- Make it visually obvious which profiles are recordings (duration-based) vs snapshots (instant)
- Add a prominent "New Recording" button to the Profiles page
- Keep the UX fast -- minimal clicks to start profiling

**Non-Goals:**
- Change backend APIs (everything needed already exists)
- Add new profile types

## Decisions

### 1. Two-group profile type selector on Connections page

Split the profile type buttons into two labeled groups:
- **Record** (circle icon): CPU -- shows duration input
- **Snapshot** (camera icon): Heap, Goroutine, Block, Mutex, All Snapshots

**Why**: Makes the recording vs snapshot distinction immediately obvious. Labels + icons reinforce the mental model.

### 2. "New Profile" button on Profiles page with inline dialog

A green play-circle button at the top of the Profiles page. Clicking it opens an inline card (not a modal) with: target selector dropdown, profile type selector (same grouped layout), duration input for CPU, and a Start button.

**Why**: Inline card is faster than a modal and stays in context. Uses the same profiling controls as the Connections page.

### 3. Profile type badges with icons

In profile lists and the profile viewer, show badges with a small icon prefix: a circle (record dot) for CPU, a camera for snapshots.

**Why**: Consistent visual language across the app.

## Risks / Trade-offs

- **None significant** -- purely frontend UI changes using existing APIs and components.
