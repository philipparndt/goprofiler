import { useEffect, useState, useRef } from "react";
import { api } from "../api";

const MAX_HISTORY = 60;

interface MetricEntry {
  name: string;
  value: any;
  type: "number" | "string" | "map" | "raw";
  history: number[]; // only for numbers
}

export default function ExpvarMetrics({ targetId, active }: { targetId: string; active: boolean }) {
  const [metrics, setMetrics] = useState<MetricEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [stale, setStale] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const historyRef = useRef<Map<string, number[]>>(new Map());

  useEffect(() => {
    if (!active) return;

    const poll = async () => {
      try {
        const resp = await api.getExpvars(targetId);
        setLastUpdate(new Date(resp.timestamp).toLocaleTimeString());
        setStale(false);

        const entries: MetricEntry[] = [];
        for (const [name, value] of Object.entries(resp.metrics)) {
          const type = inferType(value);

          // Track history for numbers
          let history = historyRef.current.get(name) || [];
          if (type === "number") {
            history = [...history, value as number].slice(-MAX_HISTORY);
            historyRef.current.set(name, history);
          }

          entries.push({ name, value, type, history });
        }

        entries.sort((a, b) => a.name.localeCompare(b.name));
        setMetrics(entries);
      } catch {
        setStale(true);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [active, targetId]);

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Last updated: {lastUpdate || "\u2014"}
          {stale && <span style={{ color: "var(--warning)", marginLeft: 8 }}>(stale)</span>}
        </span>
      </div>

      {metrics.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Name</th>
                <th style={{ width: 80 }}>Type</th>
                <th>Value</th>
                <th style={{ width: 100 }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <MetricRow key={m.name} entry={m} depth={0} expanded={expanded} onToggle={toggle} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
          {active ? "Loading expvar metrics..." : "Switch to this tab to load metrics."}
        </div>
      )}
    </div>
  );
}

function MetricRow({ entry, depth, expanded, onToggle }: {
  entry: MetricEntry;
  depth: number;
  expanded: Set<string>;
  onToggle: (name: string) => void;
}) {
  const isMap = entry.type === "map";
  const isExpanded = expanded.has(entry.name);

  return (
    <>
      <tr
        style={{ cursor: isMap ? "pointer" : undefined }}
        onClick={isMap ? () => onToggle(entry.name) : undefined}
      >
        <td className="mono" style={{ paddingLeft: 12 + depth * 20, fontSize: 13 }}>
          {isMap && (
            <span style={{ color: "var(--text-muted)", marginRight: 6 }}>{isExpanded ? "\u25bc" : "\u25b6"}</span>
          )}
          {entry.name}
        </td>
        <td><span className="badge badge-info" style={{ fontSize: 10 }}>{entry.type}</span></td>
        <td className="mono" style={{ fontSize: 12 }}>
          {isMap ? `${Object.keys(entry.value).length} keys` : formatValue(entry.value)}
        </td>
        <td>
          {entry.type === "number" && entry.history.length > 1 && (
            <Sparkline values={entry.history} />
          )}
        </td>
      </tr>
      {isMap && isExpanded && Object.entries(entry.value as Record<string, any>).map(([k, v]) => {
        const childType = inferType(v);
        const childEntry: MetricEntry = { name: k, value: v, type: childType, history: [] };
        return <MetricRow key={`${entry.name}.${k}`} entry={childEntry} depth={depth + 1} expanded={expanded} onToggle={onToggle} />;
      })}
    </>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 80;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function inferType(value: any): "number" | "string" | "map" | "raw" {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (value && typeof value === "object" && !Array.isArray(value)) return "map";
  return "raw";
}

function formatValue(value: any): string {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(2);
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
