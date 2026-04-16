## 1. Backend: Call Tree Generation

- [x] 1.1 Create `internal/flamegraph/calltree.go` with `BuildCallTree` function that converts pprof profile into a call tree structure (name, self, cum, calls, children)
- [x] 1.2 Add `callTree` field to the profile detail API response in `handler.go`

## 2. Frontend: Call Tree Component

- [x] 2.1 Create `CallTree` React component: expandable/collapsible tree rows with columns (Function, Self, Self %, Cum, Cum %, Calls)
- [x] 2.2 Add sorting support (click column headers to sort children at each level)
- [x] 2.3 Add search box that auto-expands and highlights matching nodes

## 3. Frontend: Profile Viewer Tabs

- [x] 3.1 Add tab bar to profile viewer (Flame Graph | Call Tree) sharing the same profile data
- [x] 3.2 Implement cross-linking: track selected function name, pass as search to flame graph or auto-expand in call tree when switching tabs
