## MODIFIED Requirements

### Requirement: Flame graph frame widths
The system SHALL render flame graph frames with widths proportional to their cumulative value. Children frames SHALL fill the parent frame completely when the parent has zero self time.

#### Scenario: Function with zero self time
- **WHEN** a function has 0ns self time and 240ms cumulative time
- **THEN** its children fully fill the frame width with no gap

#### Scenario: Function with self time
- **WHEN** a function has 50ms self time and 200ms cumulative time
- **THEN** children fill 150ms worth of width and a 50ms gap represents the self time
