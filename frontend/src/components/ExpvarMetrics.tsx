import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "../api";
import ExpvarValueModal from "./ExpvarValueModal";

const MAX_HISTORY = 60;
const LARGE_VALUE_THRESHOLD = 512;
const PREVIEW_CHARS = 100;

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
  const [expanded2, setExpanded2] = useState<{ name: string; value: unknown } | null>(null);
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

  // For top-level entries, look up the current value from the polled metrics
  // so the modal tracks live updates. For nested child rows we fall back to the
  // snapshot captured when the user clicked Expand.
  const liveTop = expanded2 ? metrics.find((m) => m.name === expanded2.name) : undefined;
  const modalValue = liveTop ? liveTop.value : expanded2?.value;
  const modalStale = stale;

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
                <th style={{ width: 1, whiteSpace: "nowrap" }}>Name</th>
                <th style={{ width: 1, whiteSpace: "nowrap" }}>Type</th>
                <th style={{ width: "auto" }}>Value</th>
                <th style={{ width: 1, whiteSpace: "nowrap" }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <MetricRow
                  key={m.name}
                  entry={m}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  onExpandValue={(name, value) => setExpanded2({ name, value })}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
          {active ? "Loading expvar metrics..." : "Switch to this tab to load metrics."}
        </div>
      )}

      <ExpvarValueModal
        open={expanded2 !== null}
        onOpenChange={(o) => {
          if (!o) setExpanded2(null);
        }}
        name={expanded2?.name ?? ""}
        value={modalValue}
        stale={modalStale}
      />
    </div>
  );
}

function MetricRow({ entry, depth, expanded, onToggle, onExpandValue }: {
  entry: MetricEntry;
  depth: number;
  expanded: Set<string>;
  onToggle: (name: string) => void;
  onExpandValue: (name: string, value: unknown) => void;
}) {
  const isMap = entry.type === "map";
  const isExpanded = expanded.has(entry.name);

  const { isLarge, serializedLength } = useMemo(() => classifySize(entry.value), [entry.value]);
  const preview = useMemo(
    () => (isLarge ? buildPreview(entry.value, serializedLength) : ""),
    [isLarge, entry.value, serializedLength],
  );

  return (
    <>
      <tr
        style={{ cursor: isMap && !isLarge ? "pointer" : undefined }}
        onClick={isMap && !isLarge ? () => onToggle(entry.name) : undefined}
      >
        <td
          className="mono"
          style={{ paddingLeft: 12 + depth * 20, fontSize: 13, whiteSpace: "nowrap" }}
        >
          {isMap && !isLarge && (
            <span style={{ color: "var(--text-muted)", marginRight: 6 }}>{isExpanded ? "\u25bc" : "\u25b6"}</span>
          )}
          {entry.name}
        </td>
        <td><span className="badge badge-info" style={{ fontSize: 10 }}>{entry.type}</span></td>
        <td
          className="mono"
          style={{ fontSize: 12, maxWidth: 0, overflow: "hidden" }}
        >
          {isLarge ? (
            <LargeValueCell
              preview={preview}
              onExpand={(e) => {
                e.stopPropagation();
                onExpandValue(entry.name, entry.value);
              }}
            />
          ) : isMap ? (
            `${Object.keys(entry.value).length} keys`
          ) : (
            formatValue(entry.value)
          )}
        </td>
        <td>
          {entry.type === "number" && entry.history.length > 1 && (
            <Sparkline values={entry.history} />
          )}
        </td>
      </tr>
      {isMap && !isLarge && isExpanded && Object.entries(entry.value as Record<string, any>).map(([k, v]) => {
        const childType = inferType(v);
        const childEntry: MetricEntry = { name: `${entry.name}.${k}`, value: v, type: childType, history: [] };
        return (
          <MetricRow
            key={childEntry.name}
            entry={childEntry}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            onExpandValue={onExpandValue}
          />
        );
      })}
    </>
  );
}

function LargeValueCell({ preview, onExpand }: { preview: string; onExpand: (e: React.MouseEvent) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}>
      <span
        style={{
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {preview}
      </span>
      <button
        type="button"
        onClick={onExpand}
        title="Show full value"
        style={{
          fontSize: 11,
          padding: "2px 8px",
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Expand
      </button>
    </div>
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

function classifySize(value: unknown): { isLarge: boolean; serializedLength: number } {
  if (typeof value === "number") return { isLarge: false, serializedLength: 0 };
  // Plain objects (maps) keep the inline row-expand UX regardless of serialized
  // size — the modal is for strings, arrays, and other raw values where the
  // row-expand doesn't give a good view (e.g. runtime.MemStats renders fine
  // inline, but a large array or stringified JSON does not).
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { isLarge: false, serializedLength: 0 };
  }
  let serialized: string;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  } catch {
    return { isLarge: false, serializedLength: 0 };
  }
  return { isLarge: serialized.length > LARGE_VALUE_THRESHOLD, serializedLength: serialized.length };
}

function buildPreview(value: unknown, serializedLength: number): string {
  if (typeof value === "string") {
    const head = value.slice(0, PREVIEW_CHARS);
    return `${head}… (${formatBytes(serializedLength)})`;
  }
  if (Array.isArray(value)) {
    const head = JSON.stringify(value).slice(0, PREVIEW_CHARS);
    return `[${value.length} items] ${head}…`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    const head = JSON.stringify(value).slice(0, PREVIEW_CHARS);
    return `{${keys.length} keys} ${head}…`;
  }
  const head = JSON.stringify(value).slice(0, PREVIEW_CHARS);
  return `${head}…`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
