import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ProfileDetail, CallTreeNode } from "../api";
import flamegraph from "d3-flame-graph";
import type { FlameGraphNode } from "d3-flame-graph";
import { select } from "d3-selection";
import ContextMenu from "../components/ContextMenu";
import { flameSubtreeToText, copyToClipboard, findFlameNode } from "../flameText";

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

function createDiffTooltip(rootValue: number): any {
  let tooltipEl: HTMLDivElement | null = null;

  // d3-flame-graph requires tooltip to be a callable function with .show/.hide properties
  const tip: any = function () {};

  tip.show = function (event: MouseEvent, d: FlameGraphNode) {
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "d3-flame-graph-tip";
      Object.assign(tooltipEl.style, {
        position: "absolute", display: "none", opacity: "0", pointerEvents: "none",
        background: "var(--bg-surface, #1a1a2e)", border: "1px solid var(--border, #333)",
        borderRadius: "6px", padding: "8px 12px", fontSize: "12px",
        color: "var(--text-primary, #e0e0e0)", zIndex: "1000", maxWidth: "400px",
        whiteSpace: "nowrap", transition: "opacity 0.15s",
      });
      document.body.appendChild(tooltipEl);
    }
    const val = d.data.value;
    const pct = rootValue > 0 ? ((Math.abs(val) / rootValue) * 100).toFixed(1) : "0.0";
    const sign = val > 0 ? "+" : val < 0 ? "-" : "";
    const color = val > 0 ? "#ef4444" : val < 0 ? "#3b82f6" : "#888";
    tooltipEl.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;white-space:normal;word-break:break-all">${d.data.name}</div>
      <div style="font-family:monospace;color:${color}">${sign}${Math.abs(val).toLocaleString()} (${pct}%)</div>
    `;
    let left = event.pageX + 8, top = event.pageY + 8;
    if (left + tooltipEl.offsetWidth > window.innerWidth) left = event.pageX - tooltipEl.offsetWidth - 8;
    if (top + tooltipEl.offsetHeight > window.innerHeight) top = event.pageY - tooltipEl.offsetHeight - 8;
    tooltipEl.style.left = Math.max(4, left) + "px";
    tooltipEl.style.top = Math.max(4, top) + "px";
    tooltipEl.style.display = "block";
    tooltipEl.style.opacity = "1";
  };

  tip.hide = function () {
    if (tooltipEl) { tooltipEl.style.display = "none"; tooltipEl.style.opacity = "0"; }
  };

  tip.destroy = function () {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  };

  return tip;
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
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);

  useEffect(() => {
    if (!data || !chartRef.current) return;
    chartRef.current.innerHTML = "";
    const width = chartRef.current.clientWidth || 800;
    const chart = flamegraph()
      .width(width)
      .cellHeight(20)
      .minFrameSize(1)
      .transitionDuration(300)
      .tooltip(createDiffTooltip(data?.value || 0))
      .selfValue(true)
      .setColorMapper(diffColorMapper);

    fgRef.current = chart;

    const filtered = hideUnchanged ? filterUnchanged(data) : data;
    select(chartRef.current).datum(filtered).call(chart as any);
  }, [data, hideUnchanged]);

  return (
    <div className="card" style={{ padding: 12, marginBottom: 16, overflow: "auto" }}>
      <div
        ref={chartRef}
        style={{ minHeight: 300 }}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          const label = target.closest(".d3-flame-graph-label") || target.closest("g");
          if (!label) return;
          const text = label.textContent?.trim();
          if (!text) return;
          e.preventDefault();
          setCtxMenu({ x: e.clientX, y: e.clientY, name: text });
        }}
      />
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          functionName={ctxMenu.name}
          onClose={() => setCtxMenu(null)}
          onCopy={async () => {
            const node = findFlameNode(data, ctxMenu.name);
            if (!node) return false;
            const fmtDelta = (v: number) => (v > 0 ? "+" : "") + v.toLocaleString();
            const header = `# profile diff (base → compare) — "${ctxMenu.name}" with children; positive = grew, negative = shrank`;
            const text = header + "\n" + flameSubtreeToText(node, Math.abs(data?.value || 0), fmtDelta);
            return copyToClipboard(text);
          }}
        />
      )}
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
