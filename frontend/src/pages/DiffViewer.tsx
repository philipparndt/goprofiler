import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ProfileDetail, CallTreeNode } from "../api";
import flamegraph from "d3-flame-graph";
import { select } from "d3-selection";

type DiffTab = "flamegraph" | "calltree";

export default function DiffViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const baseId = searchParams.get("base") ?? "";
  const compareId = searchParams.get("compare") ?? "";

  const [diff, setDiff] = useState<ProfileDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<DiffTab>("flamegraph");
  const [hideUnchanged, setHideUnchanged] = useState(false);

  useEffect(() => {
    if (!baseId || !compareId) {
      setError("Missing base or compare profile ID.");
      return;
    }
    api
      .diffProfiles(baseId, compareId)
      .then(setDiff)
      .catch((e: Error) => setError(e.message || "Failed to load diff"));
  }, [baseId, compareId]);

  if (error) {
    return (
      <div>
        <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>&larr; Back</button>
          <h1>Profile Diff</h1>
        </div>
        <div className="card" style={{ color: "var(--danger)" }}>{error}</div>
      </div>
    );
  }

  if (!diff) {
    return <div className="page-header"><h1>Loading diff...</h1></div>;
  }

  const base = (diff as any).base as ProfileDetail | undefined;
  const compare = (diff as any).compare as ProfileDetail | undefined;

  return (
    <div>
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>&larr; Back</button>
        <div>
          <h1>Profile Diff</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Comparing {diff.type.toUpperCase()} profiles
          </p>
        </div>
      </div>

      {/* Summary bar */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: "12px 16px",
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <DiffSummaryBlock label="Base" profile={base} color="var(--text-secondary)" />
        <div style={{ fontSize: 20, color: "var(--text-muted)" }}>&rarr;</div>
        <DiffSummaryBlock label="Compare" profile={compare} color="var(--accent)" />
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Legend:</span>
          <span style={{ color: "#ef4444", fontWeight: 600 }}>Red = regression</span>
          <span style={{ color: "#3b82f6", fontWeight: 600 }}>Blue = improvement</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        {(["flamegraph", "calltree"] as DiffTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t ? "var(--accent)" : "var(--text-secondary)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t === "flamegraph" ? "Diff Flame Graph" : "Diff Call Tree"}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", paddingRight: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hideUnchanged}
              onChange={(e) => setHideUnchanged(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Hide unchanged
          </label>
        </div>
      </div>

      {tab === "flamegraph" && (
        <DiffFlameGraph data={diff.flameGraph} hideUnchanged={hideUnchanged} />
      )}

      {tab === "calltree" && diff.callTree && (
        <DiffCallTree root={diff.callTree} hideUnchanged={hideUnchanged} />
      )}
    </div>
  );
}

function DiffSummaryBlock({
  label,
  profile,
  color,
}: {
  label: string;
  profile: ProfileDetail | undefined;
  color: string;
}) {
  if (!profile) return null;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color, fontWeight: 600 }}>
        {profile.type?.toUpperCase()} &middot; {new Date(profile.timestamp).toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {profile.targetURL}
        {profile.durationSec ? ` \u00b7 ${profile.durationSec}s` : ""}
      </div>
    </div>
  );
}

function diffColorMapper(d: any): string {
  const val: number = d.data?.value ?? 0;
  if (val > 0) return "#ef4444";
  if (val < 0) return "#3b82f6";
  return "#6b7280";
}

function DiffFlameGraph({
  data,
  hideUnchanged,
}: {
  data: any;
  hideUnchanged: boolean;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

  useEffect(() => {
    if (!data || !chartRef.current) return;
    chartRef.current.innerHTML = "";
    const width = chartRef.current.clientWidth || 800;
    const chart = flamegraph()
      .width(width)
      .cellHeight(20)
      .minFrameSize(1)
      .transitionDuration(300)
      .tooltip(true)
      .selfValue(true)
      .setColorMapper(diffColorMapper);

    fgRef.current = chart;

    const filtered = hideUnchanged ? filterUnchanged(data) : data;
    select(chartRef.current).datum(filtered).call(chart as any);
  }, [data, hideUnchanged]);

  return (
    <div className="card" style={{ padding: 12, marginBottom: 16, overflow: "auto" }}>
      <div ref={chartRef} style={{ minHeight: 300 }} />
    </div>
  );
}

function filterUnchanged(node: any): any {
  if (!node) return node;
  const children = node.children
    ? node.children.map(filterUnchanged).filter((c: any) => c !== null)
    : undefined;
  if (node.value === 0 && (!children || children.length === 0)) return null;
  return { ...node, children };
}

interface DiffRow {
  name: string;
  value: number;
  deltaPct: number;
  depth: number;
}

function flattenCallTree(node: CallTreeNode, depth: number, out: DiffRow[]) {
  out.push({
    name: node.name,
    value: node.cum,
    deltaPct: node.cumPct,
    depth,
  });
  if (node.children) {
    for (const child of node.children) {
      flattenCallTree(child, depth + 1, out);
    }
  }
}

function DiffCallTree({
  root,
  hideUnchanged,
}: {
  root: CallTreeNode;
  hideUnchanged: boolean;
}) {
  const rows: DiffRow[] = [];
  flattenCallTree(root, 0, rows);

  const filtered = hideUnchanged ? rows.filter((r) => r.value !== 0) : rows;

  return (
    <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
      <table className="table" style={{ minWidth: 700 }}>
        <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 1 }}>
          <tr>
            <th style={{ minWidth: 300 }}>Function</th>
            <th style={{ textAlign: "right", width: 100 }}>Value</th>
            <th style={{ textAlign: "right", width: 100 }}>Delta %</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, i) => {
            const isPositive = row.value > 0;
            const isNegative = row.value < 0;
            const valueColor = isPositive ? "#ef4444" : isNegative ? "#3b82f6" : "var(--text-secondary)";
            return (
              <tr key={i}>
                <td
                  className="mono"
                  style={{
                    paddingLeft: 12 + row.depth * 16,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 500,
                  }}
                >
                  {row.name}
                </td>
                <td className="mono" style={{ textAlign: "right", color: valueColor, fontWeight: row.value !== 0 ? 600 : undefined }}>
                  {row.value > 0 ? "+" : ""}{row.value}
                </td>
                <td className="mono" style={{ textAlign: "right", color: valueColor, fontWeight: row.value !== 0 ? 600 : undefined }}>
                  {row.deltaPct > 0 ? "+" : ""}{row.deltaPct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
