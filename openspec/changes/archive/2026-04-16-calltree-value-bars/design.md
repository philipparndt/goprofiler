## Context

The call tree already has per-node: `self`, `selfFmt`, `selfPct`, `cum`, `cumFmt`, `cumPct`, and `calls`. The frontend renders these as text in sortable columns. The data needed for visualization is already available -- this is a pure frontend change.

## Goals / Non-Goals

**Goals:**
- Show a stacked horizontal bar per row: self portion (warm color) + children portion (cool color)
- Bar width proportional to cumulative value relative to root total
- Toggle between absolute values ("120ms / 450ms") and relative values ("15.3% / 56.2%")
- Keep the existing sortable columns intact

**Non-Goals:**
- Backend changes (all data exists)
- Flame graph changes

## Decisions

### 1. Stacked bar in a dedicated column

Add a "Distribution" column between the Function name and the numeric columns. The bar has two segments:
- **Self** (orange/warm): width proportional to `selfPct` of total
- **Children** (blue/cool): width proportional to `(cumPct - selfPct)` of total

The entire bar's max width represents 100% of total. This gives an immediate visual comparison across rows.

**Why**: A dedicated column keeps the numeric values readable while adding the visual. Stacked bar is the standard JProfiler/IntelliJ pattern.

### 2. Absolute/Relative toggle in the toolbar

A toggle button ("Abs" / "%") in the call tree toolbar switches all value columns between:
- **Absolute**: Self column shows `selfFmt`, Cum column shows `cumFmt`
- **Relative**: Self column shows `selfPct%`, Cum column shows `cumPct%`

**Why**: Simple toggle that affects all rows at once. Both modes are useful -- absolute for understanding real cost, relative for comparing proportions.

### 3. Color scheme

Self: `var(--warning)` (orange) -- represents "hot" self-time.
Children: `var(--accent)` (indigo) -- represents delegated work.
Bar background: `var(--bg-primary)` -- shows remaining (unused) space.

**Why**: Reuses existing CSS variables. Orange for self (attention-grabbing for hot code) and indigo for children (cooler, secondary) is intuitive.

## Risks / Trade-offs

- **Visual clutter with many rows** -> Mitigated by keeping bars thin (12px height) and using subtle colors.
