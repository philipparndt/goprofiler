## Context

The backend already has a `GET /api/profiles/diff?base=ID&compare=ID` endpoint that uses `profile.Scale(-1)` + `profile.Merge` to compute a diff. But there's no UI for it, no tag system, and the diff only returns a flame graph -- not a call tree with delta values.

## Goals / Non-Goals

**Goals:**
- Tag profiles with user-defined strings for organization
- Compare any two profiles of the same type
- Diff flame graph with red/blue color scheme (regression/improvement)
- Diff call tree showing absolute and percentage deltas
- Easy selection workflow: pick base, pick compare, see diff

**Non-Goals:**
- Three-way merge or multi-profile comparison
- Automatic comparison suggestions
- Tag hierarchies or namespaces

## Decisions

### 1. Tags as a JSON string array in SQLite

Add a `tags` TEXT column to the profiles table, storing a JSON array of strings (e.g., `["baseline","v1.2"]`). Simple, queryable with SQLite JSON functions, no schema migration complexity.

**Why**: Tags are free-form and few per profile (typically 1-3). No need for a separate tags table or many-to-many relationship.

### 2. Comparison workflow

The comparison flow:
1. User clicks "Compare" on a profile in the connection detail profiles table
2. This opens a comparison selector that shows other profiles of the same type as candidates
3. User picks the second profile
4. System navigates to `/profiles/diff?base=ID1&compare=ID2`
5. The diff viewer shows: diff flame graph, diff call tree, summary stats

**Why**: Initiating from a specific profile is more natural than a standalone "compare" page. The user already knows their baseline.

### 3. Diff flame graph coloring

- Width proportional to the **base** profile values (so the visual structure matches the baseline)
- Red shades = values increased in compare (regression)
- Blue shades = values decreased in compare (improvement)
- Gray = unchanged
- Intensity proportional to the magnitude of change

**Why**: Standard diff flame graph convention used by Brendan Gregg's tools and Netflix FlameScope.

### 4. Diff call tree with delta columns

The call tree shows for each function:
- Base value, Compare value, Delta (absolute), Delta %
- Color coded: red text for increases, green for decreases
- Sortable by delta to find biggest regressions first

**Why**: The flame graph gives visual overview, the call tree gives precise numbers. Together they cover both exploratory and analytical use cases.

### 5. Comparison URL: `/profiles/diff?base=ID&compare=ID`

A dedicated route for the diff viewer. Bookmarkable and shareable.

**Why**: Deep-linkable. The existing diff API endpoint already uses this query param pattern.

## Risks / Trade-offs

- **Cross-type comparison** -> Only allow comparing profiles of the same type. Show clear error if types mismatch.
- **Large diff profiles** -> The merge operation doubles memory. For typical profiles (< 50MB) this is fine.
