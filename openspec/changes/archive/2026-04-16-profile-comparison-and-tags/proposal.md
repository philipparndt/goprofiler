## Why

Profiling a single snapshot is useful, but the real power comes from **comparison**. Common scenarios:
- **Baseline vs load**: Take a heap snapshot with no traffic, then under load. Compare to see only the load-induced allocations, filtering out static initialization noise.
- **Version comparison**: Profile v1.2 and v1.3 of the same service. Compare CPU profiles to find regressions or improvements.
- **Before/after optimization**: Profile before a code change, profile after. See exactly what changed.

Today, GoProfiler has a basic diff endpoint (`/api/profiles/diff`) but no UI for selecting profiles to compare, no tags to organize profiles, and no dedicated diff viewer. Users need a way to tag profiles ("baseline", "under-load", "v1.3") and then pick two tagged profiles to compare with a proper diff flame graph and diff call tree.

## What Changes

- **Profile tags**: Assign free-text tags to profiles for organization (e.g., "baseline", "under-load", "v2.0", "after-fix")
- **Profile comparison UI**: Select two profiles of the same type and view a diff flame graph + diff call tree
- **Diff flame graph**: Red = regression (more time/memory), blue = improvement (less), width = baseline values
- **Diff call tree**: Shows delta values (+ for increase, - for decrease) with color coding
- **Comparison selector**: Easy UI to pick base and compare profiles, filterable by tag and type

## Capabilities

### New Capabilities
- `profile-tags`: Assign, edit, and filter profiles by user-defined tags
- `profile-diff-viewer`: Side-by-side or overlay comparison of two profiles with diff flame graph and diff call tree
- `profile-selector`: UI for selecting base and compare profiles with tag filtering

### Modified Capabilities
- `profile-management`: Profile list shows tags, filterable by tag
- `connection-detail-view`: Add "Compare" action in profiles table

## Impact

- **Modified**: Backend storage -- add `tags` column to profiles table (JSON array of strings)
- **Modified**: Backend API -- add tag CRUD, enhance diff endpoint to return diff call tree
- **New**: Frontend `DiffViewer` component with diff flame graph and diff call tree
- **New**: Frontend `CompareSelector` component for picking two profiles
- **Modified**: Frontend profile list -- tag display, tag editing, tag filtering
- **Modified**: Frontend connection detail -- "Compare" button per profile
