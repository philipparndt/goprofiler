import { useState } from "react";
import type { TraceData } from "../../api";

interface Props {
  data: TraceData;
}

type Category = "channel" | "mutex" | "network" | "syscall" | "scheduler" | "other";

const CATEGORY_COLORS: Record<Category, string> = {
  channel:   "#6366f1",
  mutex:     "#ef4444",
  network:   "#3b82f6",
  syscall:   "#8b5cf6",
  scheduler: "#f59e0b",
  other:     "#6b7280",
};

const CATEGORY_LABELS: Record<Category, string> = {
  channel:   "Channel",
  mutex:     "Mutex / Lock",
  network:   "Network I/O",
  syscall:   "Syscall",
  scheduler: "Scheduler",
  other:     "Other",
};

function formatNs(ns: number): string {
  if (ns <= 0) return "—";
  if (ns < 1_000) return `${ns.toFixed(0)}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`;
  return `${(ns / 1_000_000_000).toFixed(3)}s`;
}

function normalizeCategory(raw: string): Category {
  const l = raw.toLowerCase();
  if (l.includes("chan")) return "channel";
  if (l.includes("mutex") || l.includes("lock") || l.includes("sync")) return "mutex";
  if (l.includes("net") || l.includes("io")) return "network";
  if (l.includes("syscall") || l.includes("sys")) return "syscall";
  if (l.includes("sched") || l.includes("goroutine")) return "scheduler";
  return "other";
}

interface GroupedEntry {
  location: string;
  category: Category;
  totalDuration: number;
  count: number;
  stack?: string[];
}

interface CategoryGroup {
  category: Category;
  entries: GroupedEntry[];
  totalDuration: number;
  totalCount: number;
}

export default function TraceBlocking({ data }: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(new Set());
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(new Set());

  if (data.blockingSummary.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Blocking Events</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          No significant blocking events were found in this trace.
        </p>
      </div>
    );
  }

  // Group entries by normalized category
  const categoryMap = new Map<Category, GroupedEntry[]>();
  for (const entry of data.blockingSummary) {
    const cat = normalizeCategory(entry.category);
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push({
      location: entry.location,
      category: cat,
      totalDuration: entry.totalDuration,
      count: entry.count,
      stack: entry.stack,
    });
  }

  // Sort entries within each category by totalDuration desc
  const groups: CategoryGroup[] = Array.from(categoryMap.entries())
    .map(([category, entries]) => {
      const sorted = [...entries].sort((a, b) => b.totalDuration - a.totalDuration);
      return {
        category,
        entries: sorted,
        totalDuration: sorted.reduce((s, e) => s + e.totalDuration, 0),
        totalCount: sorted.reduce((s, e) => s + e.count, 0),
      };
    })
    .sort((a, b) => b.totalDuration - a.totalDuration);

  const grandTotal = groups.reduce((s, g) => s + g.totalDuration, 0);

  const toggleCategory = (cat: Category) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleStack = (key: string) => {
    setExpandedStacks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary bar */}
      <div className="card" style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Blocking by Category
        </div>
        <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", gap: 1 }}>
          {groups.map((g) => {
            const pct = grandTotal > 0 ? (g.totalDuration / grandTotal) * 100 : 0;
            if (pct < 0.5) return null;
            return (
              <div
                key={g.category}
                title={`${CATEGORY_LABELS[g.category]}: ${formatNs(g.totalDuration)} (${pct.toFixed(1)}%)`}
                style={{
                  width: `${pct}%`,
                  background: CATEGORY_COLORS[g.category],
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
                onClick={() => toggleCategory(g.category)}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
          {groups.map((g) => {
            const pct = grandTotal > 0 ? (g.totalDuration / grandTotal) * 100 : 0;
            return (
              <span key={g.category} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-secondary)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLORS[g.category], display: "inline-block", flexShrink: 0 }} />
                {CATEGORY_LABELS[g.category]}
                <span className="mono" style={{ color: "var(--text-primary)" }}>{formatNs(g.totalDuration)}</span>
                <span style={{ color: "var(--text-muted)" }}>({pct.toFixed(1)}%)</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Category groups */}
      {groups.map((group) => {
        const isExpanded = expandedCategories.has(group.category);
        const color = CATEGORY_COLORS[group.category];
        const pct = grandTotal > 0 ? (group.totalDuration / grandTotal) * 100 : 0;

        return (
          <div
            key={group.category}
            className="card"
            style={{ padding: 0, borderLeft: `3px solid ${color}`, overflow: "hidden" }}
          >
            {/* Category header */}
            <button
              onClick={() => toggleCategory(group.category)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "none",
                border: "none",
                borderBottom: isExpanded ? "1px solid var(--border)" : "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span style={{ color: "var(--text-muted)", fontSize: 13, width: 14, flexShrink: 0 }}>
                {isExpanded ? "▾" : "▸"}
              </span>
              <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 14, minWidth: 120 }}>
                {CATEGORY_LABELS[group.category]}
              </span>
              <span style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 999,
                background: `${color}22`,
                color,
                fontWeight: 600,
              }}>
                {group.entries.length} location{group.entries.length !== 1 ? "s" : ""}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {group.totalCount} events
                </span>
                <span className="mono" style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                  {formatNs(group.totalDuration)}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {pct.toFixed(1)}%
                </span>
              </span>
            </button>

            {/* Expanded entries */}
            {isExpanded && (
              <div>
                {group.entries.map((entry, idx) => {
                  const stackKey = `${group.category}:${idx}`;
                  const stackExpanded = expandedStacks.has(stackKey);
                  const entryPct = group.totalDuration > 0 ? (entry.totalDuration / group.totalDuration) * 100 : 0;

                  return (
                    <div
                      key={idx}
                      style={{
                        borderBottom: idx < group.entries.length - 1 ? "1px solid var(--border-subtle)" : "none",
                      }}
                    >
                      {/* Entry row */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 16px 10px 36px",
                          cursor: entry.stack && entry.stack.length > 0 ? "pointer" : "default",
                        }}
                        onClick={() => entry.stack && entry.stack.length > 0 && toggleStack(stackKey)}
                      >
                        {entry.stack && entry.stack.length > 0 && (
                          <span style={{ color: "var(--text-muted)", fontSize: 11, width: 12, flexShrink: 0 }}>
                            {stackExpanded ? "▾" : "▸"}
                          </span>
                        )}
                        {(!entry.stack || entry.stack.length === 0) && (
                          <span style={{ width: 12, flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            className="mono"
                            style={{
                              fontSize: 12,
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={entry.location}
                          >
                            {entry.location}
                          </div>
                          {/* Duration bar */}
                          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 4, background: "var(--bg-primary)", borderRadius: 2, overflow: "hidden", maxWidth: 200 }}>
                              <div style={{ width: `${entryPct}%`, height: "100%", background: color, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{entryPct.toFixed(1)}% of category</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 16, flexShrink: 0, alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            ×{entry.count}
                          </span>
                          <span className="mono" style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>
                            {formatNs(entry.totalDuration)}
                          </span>
                          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", width: 70, textAlign: "right" }}>
                            avg {formatNs(entry.totalDuration / entry.count)}
                          </span>
                        </div>
                      </div>

                      {/* Stack trace */}
                      {stackExpanded && entry.stack && entry.stack.length > 0 && (
                        <div style={{ padding: "0 16px 12px 60px" }}>
                          <div style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-md)",
                            padding: "10px 14px",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            lineHeight: 1.7,
                            overflowX: "auto",
                          }}>
                            {entry.stack.map((frame, fi) => (
                              <div
                                key={fi}
                                style={{ color: fi === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}
                              >
                                {frame}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
