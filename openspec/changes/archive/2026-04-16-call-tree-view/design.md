## Context

The profile viewer currently shows a flame graph and a flat top-functions table. The flame graph merges identical stack frames, losing call-count information. pprof profile data contains per-sample stack traces -- by aggregating these we can reconstruct a call tree with invocation counts.

## Goals / Non-Goals

**Goals:**
- Render an expandable call tree from pprof data showing: function name, self value, cumulative value, invocation count
- Tree is collapsible/expandable with all nodes collapsed by default (except the root)
- Sortable by any column
- Clicking a function cross-highlights it in the flame graph

**Non-Goals:**
- Reverse call tree (bottom-up / callers view) -- future enhancement
- Source code integration -- future enhancement

## Decisions

### 1. Call tree computed server-side alongside flame graph

The backend already parses pprof data in `getProfile`. We'll add a `CallTree` field to the response, computed from the same parsed profile. This avoids re-parsing on the frontend.

**Why**: pprof parsing is Go-native and fast. Sending a pre-computed JSON tree is simpler than sending raw data and parsing in JS.

### 2. Tree node structure

Each node: `{ name, self, cum, calls, children[] }`. `calls` is the number of distinct samples where this function appears at this position in the call chain.

**Why**: This matches JProfiler's model. Self/cum values come from pprof sample values. Call count = number of samples passing through that edge.

### 3. Frontend: tab-based view in profile viewer

Add a tab bar (Flame Graph | Call Tree) to the profile viewer. Both tabs share the same profile data from a single API call.

**Why**: Tabs keep the UI clean. No extra API calls needed since both views use the same data.

## Risks / Trade-offs

- **Large trees for complex profiles** -> Mitigated by collapsing all nodes by default and lazy-rendering only visible nodes.
- **Call count is sample-based, not exact** -> This is inherent to sampling profilers. Document clearly that counts reflect sample frequency, not actual invocation counts.
