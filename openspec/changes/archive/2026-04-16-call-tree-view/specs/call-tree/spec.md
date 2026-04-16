## ADDED Requirements

### Requirement: Generate call tree from profile
The system SHALL generate a hierarchical call tree from pprof profile data. Each node SHALL include: function name, self value, cumulative value, and sample count (invocation count).

#### Scenario: CPU profile call tree
- **WHEN** user views a CPU profile
- **THEN** system provides a call tree where each node shows function name, self CPU time, cumulative CPU time, and the number of samples passing through that call edge

#### Scenario: Heap profile call tree
- **WHEN** user views a heap profile
- **THEN** system provides a call tree where values represent allocated bytes instead of CPU time

### Requirement: Expandable tree UI
The system SHALL render the call tree as an expandable/collapsible tree. All nodes SHALL be collapsed by default except the root and its immediate children.

#### Scenario: Expand a node
- **WHEN** user clicks the expand arrow on a collapsed tree node
- **THEN** system reveals its children with their metrics

#### Scenario: Collapse a node
- **WHEN** user clicks the collapse arrow on an expanded node
- **THEN** system hides its children

### Requirement: Sortable call tree columns
The system SHALL display call tree nodes in a table with sortable columns: Function, Self, Self %, Cumulative, Cum %, Calls.

#### Scenario: Sort by self time
- **WHEN** user clicks the "Self" column header
- **THEN** children at each level are sorted by self value descending

#### Scenario: Sort by calls
- **WHEN** user clicks the "Calls" column header
- **THEN** children at each level are sorted by invocation count descending

### Requirement: Call tree search
The system SHALL support searching for function names in the call tree, auto-expanding and highlighting matching nodes.

#### Scenario: Search for function
- **WHEN** user types a search query in the call tree search box
- **THEN** system auto-expands tree paths containing matching functions and highlights them
