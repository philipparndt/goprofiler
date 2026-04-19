## Context

The d3-flame-graph library accepts a tooltip configuration. Currently `tooltip(true)` enables the default tooltip which only renders `d.data.name`. The library supports passing a custom tooltip object with `.show(event, d)` and `.hide()` methods, where `d` provides `d.data.name`, `d.data.value` (absolute cumulative value), and `d.value` (layout value).

Each `FlameNode.value` represents:
- **Heap/allocs profiles**: bytes (inuse_space or alloc_space)
- **CPU profiles**: nanoseconds
- **Other profiles**: sample count

The root node's value is the total, enabling percentage calculation as `(node.value / root.value) * 100`.

## Goals / Non-Goals

**Goals:**
- Show absolute formatted values in tooltips (bytes, duration, or count)
- Show percentage relative to total profile
- Show sample count
- Detect profile type to choose the right formatter

**Non-Goals:**
- Showing self vs cumulative breakdown in the tooltip (flame graph nodes only have cumulative)
- Customizing DiffViewer tooltips (separate effort)
- Adding tooltip interactivity (click, links)

## Decisions

### 1. Custom HTML tooltip via d3-flame-graph API

**Decision:** Create a custom tooltip object that implements `.show(event, d)` and `.hide()` methods, rendering an HTML div with styled content. Pass it to `chart.tooltip(customTooltip)` instead of `tooltip(true)`.

**Why:** The library natively supports this pattern. No library patches needed.

### 2. Profile type detection from profile metadata

**Decision:** Use `profile.type` (already available in ProfileViewer state) to determine the value format: `"heap"` / `"allocs"` → bytes, `"cpu"` → duration, others → raw count.

**Why:** The profile type is already loaded and determines the semantics of the value field.

### 3. Store root value for percentage calculation

**Decision:** Capture `profile.flameGraph.value` (the root node's value) and use it to compute `(d.data.value / rootValue) * 100` for each tooltip.

**Why:** Simple, efficient, and the root value is always available from the loaded profile data.

## Risks / Trade-offs

- **[Type definition gap]** The `.d.ts` file types `tooltip()` as accepting only `boolean`. → Mitigation: Update the type definition to accept `boolean | object`.
- **[Value semantics vary]** Different profile types use different units. → Mitigation: Profile type detection with appropriate formatters covers all cases.
