## MODIFIED Requirements

### Requirement: Heap flame graph value mode toggle
The system SHALL provide a toggle for heap profiles to switch the flame graph and call tree between "Inuse" (current live memory) and "Alloc" (total cumulative allocations) visualization modes.

#### Scenario: Switch to alloc mode
- **WHEN** user clicks "Alloc" toggle on a heap profile
- **THEN** the flame graph and call tree re-render showing alloc_space values, and the summary bar swaps primary/secondary roles

#### Scenario: Default to inuse
- **WHEN** user opens a heap profile
- **THEN** the flame graph shows inuse_space by default
