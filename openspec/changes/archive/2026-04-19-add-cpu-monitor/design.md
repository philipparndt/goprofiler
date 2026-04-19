## Context

The goprofiler currently monitors Go processes via their `/debug/pprof/` endpoints. Memory stats are fetched by parsing the text output of `/debug/pprof/heap?debug=1` every second. CPU profiling is only available as on-demand snapshots. This change adds continuous CPU usage monitoring following the same architectural patterns.

The key challenge is that Go's CPU profile endpoint (`/debug/pprof/profile?seconds=N`) blocks for the sampling duration and returns binary protobuf data, unlike the text-based heap endpoint. This requires a different collection strategy.

## Goals / Non-Goals

**Goals:**
- Provide real-time CPU usage visualization matching the UX of the existing memory chart
- Collect CPU profile data without overloading the target process
- Reuse existing patterns (polling, time-series storage, incremental API, canvas chart)

**Non-Goals:**
- Per-function CPU breakdown (that's what the existing snapshot profiler does)
- OS-level CPU metrics (we only use Go's pprof endpoints)
- Sub-second CPU resolution

## Decisions

### 1. CPU data collection via short pprof profiles

**Decision:** Take short CPU profiles (1 second) from the target's `/debug/pprof/profile?seconds=1` endpoint on a 5-second interval. Parse the protobuf profile to extract total CPU sample count and duration.

**Why:** This is the only CPU metric available through standard Go pprof endpoints. A 1-second sample every 5 seconds gives useful data without overwhelming the target (only 20% profiling overhead).

**Alternatives considered:**
- Runtime metrics (`/gc/cpu/total:cpu-seconds`): Only available in newer Go versions and requires the target to expose them via a custom endpoint
- Continuous profiling: Would impose 100% CPU profiling overhead on the target
- Shorter sample intervals: Risk of overlapping profiles and higher overhead

### 2. Separate CPU collector service

**Decision:** Create a new `CpuService` in `internal/monitor/` with its own poll loop, data storage, and API, parallel to the existing memory `Service`.

**Why:** CPU collection has fundamentally different timing (5s vs 1s intervals), data shapes (CPU percentage vs memory bytes), and collection mechanics (blocking HTTP call vs instant response). Keeping it separate avoids complicating the existing memory collector.

### 3. CPU metric: percentage utilization

**Decision:** Compute CPU usage as a percentage: `(total CPU sample time / wall clock duration) * 100`. This gives a 0-N% value where N can exceed 100% for multi-core usage.

**Why:** Percentage is the most intuitive and universal CPU metric. It maps directly to what developers expect from a CPU monitor.

### 4. Frontend: CpuChart component mirroring MemoryChart

**Decision:** Create a new `CpuChart.tsx` canvas component following the same patterns as `MemoryChart.tsx`. Display CPU percentage over time with the same window duration controls.

**Why:** Consistency with the existing UI. Users already understand the memory chart interaction model.

### 5. CPU monitoring opt-in per target

**Decision:** CPU monitoring is disabled by default and toggled on/off per target via a UI control. The backend exposes enable/disable API endpoints that start/stop the CPU poll loop for that target.

**Why:** CPU profiling adds ~20% overhead to the target process. Users must consciously opt in, and be able to stop it without disconnecting. Disabled by default avoids surprising users with unexpected overhead on production targets.

**Alternatives considered:**
- Global on/off setting: Too coarse — users may want CPU monitoring on dev targets but not production
- Always-on with lower frequency: Still imposes overhead without user consent

## Risks / Trade-offs

- **[Blocking profile call]** The `/debug/pprof/profile?seconds=1` call blocks for 1 second. → Mitigation: Use a dedicated goroutine per target and a 5-second interval so profiles never overlap.
- **[Target overhead]** CPU profiling adds overhead to the target process. → Mitigation: Short 1-second profiles with 4-second gaps keep overhead at ~20%. Consider making the interval configurable later.
- **[Protobuf parsing]** Requires a protobuf dependency to parse pprof profiles. → Mitigation: Use `github.com/google/pprof/profile` which is the standard Go pprof profile parser.
- **[Stale data]** 5-second intervals mean the chart updates less frequently than the 1-second memory chart. → Mitigation: This is an acceptable trade-off clearly communicated by the chart's update cadence.
