## ADDED Requirements

### Requirement: Filter pprof overhead from profiles
The system SHALL support filtering out pprof infrastructure overhead from heap and alloc profiles. The filter removes samples where the call stack includes `runtime/pprof` or `net/http/pprof` functions.

#### Scenario: Heap profile with filter on
- **WHEN** user views a heap profile with "Hide profiler overhead" enabled (default)
- **THEN** functions like `runtime/pprof.printStackRecord` and `text/tabwriter.Write` are absent from the flame graph, call tree, and top functions table

#### Scenario: Toggle filter off
- **WHEN** user disables "Hide profiler overhead"
- **THEN** all samples including pprof infrastructure are shown

#### Scenario: Totals recalculated
- **WHEN** the filter is active
- **THEN** the heap summary bar (inuse/alloc totals) reflects the filtered values, not the raw totals

### Requirement: Filter enabled by default for heap/allocs
The system SHALL enable the pprof noise filter by default for heap and allocs profile types. For other profile types the filter SHALL be hidden.

#### Scenario: Open heap profile
- **WHEN** user opens a heap profile
- **THEN** the "Hide profiler overhead" toggle is visible and enabled by default

#### Scenario: Open CPU profile
- **WHEN** user opens a CPU profile
- **THEN** the "Hide profiler overhead" toggle is not shown
