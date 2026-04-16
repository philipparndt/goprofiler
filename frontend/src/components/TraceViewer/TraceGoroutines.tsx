import { useState } from "react";
import type { TraceData } from "../../api";

interface Props {
  data: TraceData;
  onSelectGoroutine?: (id: number) => void;
}

type SortKey = "id" | "name" | "running" | "runnable" | "blocked" | "syscall" | "waiting" | "transitions";
type SortDir = "asc" | "desc";

interface GoroutineStats {
  id: number;
  name: string;
  running: number;
  runnable: number;
  blocked: number;
  syscall: number;
  waiting: number;
  transitions: number;
  total: number;
}

const STATE_COLORS: Record<string, string> = {
  running:  "#22c55e",
  runnable: "#f59e0b",
  blocked:  "#ef4444",
  syscall:  "#8b5cf6",
  waiting:  "#6b7280",
};

function formatNs(ns: number): string {
  if (ns <= 0) return "—";
  if (ns < 1_000) return `${ns.toFixed(0)}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`;
  return `${(ns / 1_000_000_000).toFixed(2)}s`;
}

function MiniStackBar({ stats }: { stats: GoroutineStats }) {
  const total = stats.total || 1;
  const segments: { state: string; pct: number }[] = [
    { state: "running",  pct: (stats.running  / total) * 100 },
    { state: "runnable", pct: (stats.runnable / total) * 100 },
    { state: "blocked",  pct: (stats.blocked  / total) * 100 },
    { state: "syscall",  pct: (stats.syscall  / total) * 100 },
    { state: "waiting",  pct: (stats.waiting  / total) * 100 },
  ].filter((s) => s.pct > 0);

  return (
    <div
      title={`running: ${formatNs(stats.running)}, runnable: ${formatNs(stats.runnable)}, blocked: ${formatNs(stats.blocked)}, syscall: ${formatNs(stats.syscall)}, waiting: ${formatNs(stats.waiting)}`}
      style={{
        display: "flex",
        height: 8,
        borderRadius: 4,
        overflow: "hidden",
        background: "var(--bg-primary)",
        minWidth: 80,
        width: "100%",
      }}
    >
      {segments.map((seg) => (
        <div
          key={seg.state}
          style={{
            width: `${seg.pct}%`,
            background: STATE_COLORS[seg.state] ?? STATE_COLORS.waiting,
            transition: "width 0.2s",
          }}
        />
      ))}
    </div>
  );
}

export default function TraceGoroutines({ data, onSelectGoroutine }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("running");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  // Build per-goroutine stats
  const statsMap: GoroutineStats[] = data.goroutines.map((g) => {
    const acc: Record<string, number> = { running: 0, runnable: 0, blocked: 0, syscall: 0, waiting: 0 };
    let transitions = 0;
    let prevState = "";
    for (const span of g.spans) {
      const dur = span.end - span.start;
      acc[span.state] = (acc[span.state] ?? 0) + dur;
      if (prevState && prevState !== span.state) transitions++;
      prevState = span.state;
    }
    const total = Object.values(acc).reduce((a, b) => a + b, 0);
    return {
      id: g.id,
      name: g.name,
      running: acc.running ?? 0,
      runnable: acc.runnable ?? 0,
      blocked: acc.blocked ?? 0,
      syscall: acc.syscall ?? 0,
      waiting: acc.waiting ?? 0,
      transitions,
      total,
    };
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const ind = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " ▼" : " ▲";
  };

  const searchLower = search.toLowerCase();
  const filtered = search
    ? statsMap.filter((s) => `g${s.id}`.includes(searchLower) || s.name.toLowerCase().includes(searchLower))
    : statsMap;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "id":          cmp = a.id - b.id; break;
      case "name":        cmp = a.name.localeCompare(b.name); break;
      case "running":     cmp = a.running - b.running; break;
      case "runnable":    cmp = a.runnable - b.runnable; break;
      case "blocked":     cmp = a.blocked - b.blocked; break;
      case "syscall":     cmp = a.syscall - b.syscall; break;
      case "waiting":     cmp = a.waiting - b.waiting; break;
      case "transitions": cmp = a.transitions - b.transitions; break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Summary legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {Object.entries(STATE_COLORS).map(([state, color]) => (
          <span key={state} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
            {state.charAt(0).toUpperCase() + state.slice(1)}
          </span>
        ))}
      </div>

      {/* Search */}
      <input
        className="input"
        style={{ maxWidth: 280 }}
        placeholder="Filter goroutines..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "calc(100vh - 380px)" }}>
        <table className="table" style={{ minWidth: 700 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 1 }}>
            <tr>
              <th onClick={() => toggleSort("id")} style={{ width: 60 }}>ID{ind("id")}</th>
              <th onClick={() => toggleSort("name")} style={{ minWidth: 200 }}>Name{ind("name")}</th>
              <th style={{ width: 120 }}>State Mix</th>
              <th onClick={() => toggleSort("running")} style={{ textAlign: "right", width: 90 }}>
                <span style={{ color: STATE_COLORS.running }}>Running{ind("running")}</span>
              </th>
              <th onClick={() => toggleSort("runnable")} style={{ textAlign: "right", width: 90 }}>
                <span style={{ color: STATE_COLORS.runnable }}>Runnable{ind("runnable")}</span>
              </th>
              <th onClick={() => toggleSort("blocked")} style={{ textAlign: "right", width: 90 }}>
                <span style={{ color: STATE_COLORS.blocked }}>Blocked{ind("blocked")}</span>
              </th>
              <th onClick={() => toggleSort("syscall")} style={{ textAlign: "right", width: 90 }}>
                <span style={{ color: STATE_COLORS.syscall }}>Syscall{ind("syscall")}</span>
              </th>
              <th onClick={() => toggleSort("waiting")} style={{ textAlign: "right", width: 90 }}>
                <span style={{ color: STATE_COLORS.waiting }}>Waiting{ind("waiting")}</span>
              </th>
              <th onClick={() => toggleSort("transitions")} style={{ textAlign: "right", width: 90 }}>
                Transitions{ind("transitions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.id}
                style={{ cursor: onSelectGoroutine ? "pointer" : "default" }}
                onClick={() => onSelectGoroutine?.(s.id)}
              >
                <td className="mono" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {s.id}
                </td>
                <td className="mono" style={{ fontSize: 12, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name || <span style={{ color: "var(--text-muted)" }}>(unnamed)</span>}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <MiniStackBar stats={s} />
                </td>
                <td className="mono" style={{ textAlign: "right", color: s.running > 0 ? STATE_COLORS.running : "var(--text-muted)" }}>
                  {formatNs(s.running)}
                </td>
                <td className="mono" style={{ textAlign: "right", color: s.runnable > 0 ? STATE_COLORS.runnable : "var(--text-muted)" }}>
                  {formatNs(s.runnable)}
                </td>
                <td className="mono" style={{ textAlign: "right", color: s.blocked > 0 ? STATE_COLORS.blocked : "var(--text-muted)" }}>
                  {formatNs(s.blocked)}
                </td>
                <td className="mono" style={{ textAlign: "right", color: s.syscall > 0 ? STATE_COLORS.syscall : "var(--text-muted)" }}>
                  {formatNs(s.syscall)}
                </td>
                <td className="mono" style={{ textAlign: "right", color: s.waiting > 0 ? STATE_COLORS.waiting : "var(--text-muted)" }}>
                  {formatNs(s.waiting)}
                </td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {s.transitions}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                  No goroutines match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {sorted.length} of {statsMap.length} goroutines
      </div>
    </div>
  );
}
