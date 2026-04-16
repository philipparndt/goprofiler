import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ProfileDetail, CallTreeNode, TopFunction } from "../api";
import flamegraph from "d3-flame-graph";
import { select } from "d3-selection";

type Tab = "flamegraph" | "calltree";
type SortKey = "name" | "self" | "selfPct" | "cum" | "cumPct" | "calls";

export default function ProfileViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [tab, setTab] = useState<Tab>("flamegraph");
  const [search, setSearch] = useState("");
  const [, setSelectedFn] = useState("");
  const [colorMode, setColorMode] = useState<"package" | "heat">("package");
  const [inverted, setInverted] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

  useEffect(() => {
    if (id) {
      api.getProfile(id).then(setProfile).catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    if (!profile || !chartRef.current || tab !== "flamegraph") return;

    chartRef.current.innerHTML = "";

    const width = chartRef.current.clientWidth;
    const chart = flamegraph()
      .width(width)
      .cellHeight(20)
      .inverted(inverted)
      .minFrameSize(1)
      .transitionDuration(300)
      .tooltip(true)
      .selfValue(true)
      .setColorMapper((d: any) => {
        if (colorMode === "heat") {
          const ratio = d.highlight ? 1 : (d.data?.value || 0) / (profile.flameGraph?.value || 1);
          const r = Math.round(200 + 55 * ratio);
          const g = Math.round(100 * (1 - ratio));
          const b = Math.round(50 * (1 - ratio));
          return `rgb(${r},${g},${b})`;
        }
        const name: string = d.data?.name || "";
        const pkg = name.includes("/") ? name.substring(0, name.lastIndexOf("/")) : name.split(".")[0];
        let hash = 0;
        for (let i = 0; i < pkg.length; i++) {
          hash = pkg.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        const s = 50 + (Math.abs(hash >> 8) % 20);
        const l = d.highlight ? 60 : 35 + (Math.abs(hash >> 16) % 15);
        return `hsl(${h}, ${s}%, ${l}%)`;
      });

    fgRef.current = chart;

    select(chartRef.current)
      .datum(profile.flameGraph)
      .call(chart as any);
  }, [profile, colorMode, inverted, tab]);

  useEffect(() => {
    if (fgRef.current && tab === "flamegraph") {
      // Escape regex special chars to avoid "Invalid regular expression" errors
      const escaped = search ? search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
      fgRef.current.search(escaped);
    }
  }, [search, tab]);

  const handleSelectFunction = useCallback((name: string) => {
    setSelectedFn(name);
    setSearch(name);
  }, []);

  if (!profile) {
    return <div className="page-header"><h1>Loading...</h1></div>;
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>&larr; Back</button>
        <div>
          <h1>{profile.type.toUpperCase()} Profile</h1>
          <p>{profile.targetURL} &middot; {new Date(profile.timestamp).toLocaleString()}{profile.durationSec ? ` \u00b7 ${profile.durationSec}s` : ""}</p>
        </div>
      </div>

      {/* Trace type: show download card instead of flame graph */}
      {profile.type === "trace" && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <h3 style={{ marginBottom: 8 }}>Execution Trace</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: 16, maxWidth: 400, margin: "0 auto 16px" }}>
            Execution traces capture goroutine scheduling, syscalls, GC events, and network I/O. Download the trace file and open it with Go's trace tool.
          </p>
          <button className="btn btn-primary" onClick={() => api.exportProfile(profile.id)} style={{ marginBottom: 16 }}>
            Download Trace ({formatTraceSize(profile.size)})
          </button>
          <div className="code-block" style={{ maxWidth: 400, margin: "0 auto", textAlign: "left" }}>
            <pre><code>go tool trace {profile.id}.trace</code></pre>
          </div>
        </div>
      )}

      {profile.type !== "trace" && <>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => setTab("flamegraph")}
          style={{
            padding: "10px 20px",
            background: "none",
            border: "none",
            borderBottom: tab === "flamegraph" ? "2px solid var(--accent)" : "2px solid transparent",
            color: tab === "flamegraph" ? "var(--accent)" : "var(--text-secondary)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Flame Graph
        </button>
        <button
          onClick={() => setTab("calltree")}
          style={{
            padding: "10px 20px",
            background: "none",
            border: "none",
            borderBottom: tab === "calltree" ? "2px solid var(--accent)" : "2px solid transparent",
            color: tab === "calltree" ? "var(--accent)" : "var(--text-secondary)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Call Tree
        </button>
      </div>

      {tab === "flamegraph" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ maxWidth: 300 }}
                placeholder="Search functions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 4 }}>
                <button className={`btn btn-sm ${colorMode === "package" ? "btn-primary" : "btn-secondary"}`} onClick={() => setColorMode("package")}>
                  By Package
                </button>
                <button className={`btn btn-sm ${colorMode === "heat" ? "btn-primary" : "btn-secondary"}`} onClick={() => setColorMode("heat")}>
                  By Heat
                </button>
              </div>
              <button className={`btn btn-sm ${inverted ? "btn-primary" : "btn-secondary"}`} onClick={() => setInverted(!inverted)}>
                {inverted ? "Icicle" : "Flame"} View
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => fgRef.current?.resetZoom()}>
                Reset Zoom
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 12, marginBottom: 16, overflow: "auto" }}>
            <div ref={chartRef} style={{ minHeight: 300 }} />
          </div>

          {profile.topFunctions && profile.topFunctions.length > 0 && (
            <TopFunctionsTable functions={profile.topFunctions} onSelect={handleSelectFunction} />
          )}
        </>
      )}

      {tab === "calltree" && profile.callTree && (
        <CallTree
          root={profile.callTree}
          onSelectFunction={handleSelectFunction}
        />
      )}
      </>}
    </div>
  );
}

function formatTraceSize(bytes: number): string {
  if (bytes >= 1 << 20) return (bytes / (1 << 20)).toFixed(1) + " MB";
  if (bytes >= 1 << 10) return (bytes / (1 << 10)).toFixed(1) + " KB";
  return bytes + " B";
}

type TopSortKey = "name" | "flat" | "flatPct" | "cum" | "cumPct";

function TopFunctionsTable({ functions, onSelect }: {
  functions: TopFunction[];
  onSelect: (name: string) => void;
}) {
  const [sortKey, setSortKey] = useState<TopSortKey>("cumPct");
  const [sortAsc, setSortAsc] = useState(false);

  const toggle = (key: TopSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const ind = (key: TopSortKey) => sortKey === key ? (sortAsc ? " \u25b2" : " \u25bc") : "";

  const sorted = [...functions].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "flat": cmp = a.flatPercent - b.flatPercent; break;
      case "flatPct": cmp = a.flatPercent - b.flatPercent; break;
      case "cum": cmp = a.cumPercent - b.cumPercent; break;
      case "cumPct": cmp = a.cumPercent - b.cumPercent; break;
    }
    return sortAsc ? cmp : -cmp;
  });

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <span className="card-title">Top Functions</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th onClick={() => toggle("name")} style={{ minWidth: 300 }}>Function{ind("name")}</th>
            <th onClick={() => toggle("flat")} style={{ textAlign: "right", width: 90 }}>Flat{ind("flat")}</th>
            <th onClick={() => toggle("flatPct")} style={{ textAlign: "right", width: 70 }}>Flat %{ind("flatPct")}</th>
            <th onClick={() => toggle("cum")} style={{ textAlign: "right", width: 90 }}>Cum{ind("cum")}</th>
            <th onClick={() => toggle("cumPct")} style={{ textAlign: "right", width: 70 }}>Cum %{ind("cumPct")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 50).map((fn, i) => (
            <tr key={i} style={{ cursor: "pointer" }} onClick={() => onSelect(fn.name)}>
              <td className="mono">{fn.name}</td>
              <td className="mono" style={{ textAlign: "right" }}>{fn.flat}</td>
              <td className="mono" style={{ textAlign: "right" }}>{fn.flatPercent.toFixed(1)}%</td>
              <td className="mono" style={{ textAlign: "right" }}>{fn.cum}</td>
              <td className="mono" style={{ textAlign: "right" }}>{fn.cumPercent.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ValueMode = "absolute" | "relative";

interface VisibleRow {
  node: CallTreeNode;
  path: string;
  parentPath: string;
  depth: number;
}

function CallTree({ root, onSelectFunction }: {
  root: CallTreeNode;
  onSelectFunction: (name: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("cum");
  const [sortAsc, setSortAsc] = useState(false);
  const [treeSearch, setTreeSearch] = useState("");
  const [valueMode, setValueMode] = useState<ValueMode>("absolute");
  const [focusIndex, setFocusIndex] = useState(0);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    initial.add("root");
    return initial;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortAsc ? " \u25b2" : " \u25bc";
  };

  const sortChildren = (children: CallTreeNode[]): CallTreeNode[] => {
    return [...children].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "self": cmp = a.self - b.self; break;
        case "selfPct": cmp = a.selfPct - b.selfPct; break;
        case "cum": cmp = a.cum - b.cum; break;
        case "cumPct": cmp = a.cumPct - b.cumPct; break;
        case "calls": cmp = a.calls - b.calls; break;
      }
      return sortAsc ? cmp : -cmp;
    });
  };

  // Build flat visible rows array
  const visibleRows: VisibleRow[] = [];
  const buildVisibleRows = (node: CallTreeNode, path: string, depth: number) => {
    const currentPath = path ? `${path}/${node.name}` : node.name;
    if (depth > 0) {
      visibleRows.push({ node, path: currentPath, parentPath: path, depth });
    }
    const isExpanded = expandedPaths.has(currentPath);
    if ((depth === 0 || isExpanded) && node.children && node.children.length > 0) {
      for (const child of sortChildren(node.children)) {
        buildVisibleRows(child, currentPath, depth + 1);
      }
    }
  };
  buildVisibleRows(root, "", 0);

  // Auto-expand paths matching search
  useEffect(() => {
    if (!treeSearch) return;
    const query = treeSearch.toLowerCase();
    const paths = new Set<string>(expandedPaths);
    const walk = (node: CallTreeNode, path: string) => {
      const currentPath = path ? `${path}/${node.name}` : node.name;
      if (node.name.toLowerCase().includes(query)) {
        let p = path;
        while (p) {
          paths.add(p);
          const lastSlash = p.lastIndexOf("/");
          p = lastSlash >= 0 ? p.substring(0, lastSlash) : "";
        }
        paths.add("root");
      }
      node.children?.forEach((c) => walk(c, currentPath));
    };
    walk(root, "");
    setExpandedPaths(paths);
  }, [treeSearch]);

  // Scroll focused row into view
  useEffect(() => {
    const row = rowRefs.current.get(focusIndex);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [focusIndex]);

  // Clamp focus index when visible rows change
  useEffect(() => {
    if (focusIndex >= visibleRows.length && visibleRows.length > 0) {
      setFocusIndex(visibleRows.length - 1);
    }
  }, [visibleRows.length]);

  const toggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAllDescendants = (node: CallTreeNode, path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      const walk = (n: CallTreeNode, p: string) => {
        const cp = p ? `${p}/${n.name}` : n.name;
        if (n.children && n.children.length > 0) {
          next.add(cp);
          n.children.forEach((c) => walk(c, cp));
        }
      };
      walk(node, path.substring(0, path.lastIndexOf("/")));
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle if focus is in the search input
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    const row = visibleRows[focusIndex];
    if (!row && visibleRows.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, visibleRows.length - 1));
        break;

      case "ArrowUp":
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
        break;

      case "ArrowRight":
        e.preventDefault();
        if (row) {
          const hasChildren = row.node.children && row.node.children.length > 0;
          const isExpanded = expandedPaths.has(row.path);
          if (hasChildren && !isExpanded) {
            toggle(row.path);
          } else if (hasChildren && isExpanded) {
            // Move to first child
            setFocusIndex((i) => Math.min(i + 1, visibleRows.length - 1));
          }
        }
        break;

      case "ArrowLeft":
        e.preventDefault();
        if (row) {
          const isExpanded = expandedPaths.has(row.path);
          const hasChildren = row.node.children && row.node.children.length > 0;
          if (hasChildren && isExpanded) {
            toggle(row.path);
          } else {
            // Move to parent
            const parentIdx = visibleRows.findIndex((r) => r.path === row.parentPath);
            if (parentIdx >= 0) {
              setFocusIndex(parentIdx);
            }
          }
        }
        break;

      case "Enter":
      case " ":
        e.preventDefault();
        if (row) {
          onSelectFunction(row.node.name);
        }
        break;

      case "Home":
        e.preventDefault();
        setFocusIndex(0);
        break;

      case "End":
        e.preventDefault();
        setFocusIndex(visibleRows.length - 1);
        break;

      case "*":
        e.preventDefault();
        if (row) {
          expandAllDescendants(row.node, row.path);
        }
        break;
    }
  };

  const searchLower = treeSearch.toLowerCase();

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            className="input"
            style={{ maxWidth: 300 }}
            placeholder="Search call tree..."
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={`btn btn-sm ${valueMode === "absolute" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setValueMode("absolute")}
            >
              Abs
            </button>
            <button
              className={`btn btn-sm ${valueMode === "relative" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setValueMode("relative")}
            >
              %
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 1, background: "var(--warning)", display: "inline-block" }} />Self</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 1, background: "var(--accent)", display: "inline-block" }} />Children</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
            Use arrow keys to navigate
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="card"
        style={{ padding: 0, overflow: "auto", maxHeight: "calc(100vh - 280px)", outline: "none" }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <table className="table" style={{ minWidth: 800 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 1 }}>
            <tr>
              <th onClick={() => toggleSort("name")} style={{ minWidth: 300 }}>Function{sortIndicator("name")}</th>
              <th style={{ width: 120 }}>Distribution</th>
              <th onClick={() => toggleSort("self")} style={{ textAlign: "right", width: 90 }}>Self{sortIndicator("self")}</th>
              <th onClick={() => toggleSort("cum")} style={{ textAlign: "right", width: 90 }}>Cum{sortIndicator("cum")}</th>
              <th onClick={() => toggleSort("calls")} style={{ textAlign: "right", width: 80 }} title="Number of profiler samples (not exact invocation count)">Samples{sortIndicator("calls")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, idx) => {
              const { node, path, depth } = row;
              const isExpanded = expandedPaths.has(path);
              const hasChildren = node.children && node.children.length > 0;
              const isFocused = idx === focusIndex;
              const isMatch = !isFocused && searchLower && node.name.toLowerCase().includes(searchLower);
              const childrenPct = node.cumPct - node.selfPct;
              const selfVal = valueMode === "absolute" ? node.selfFmt : `${node.selfPct.toFixed(1)}%`;
              const cumVal = valueMode === "absolute" ? node.cumFmt : `${node.cumPct.toFixed(1)}%`;

              return (
                <tr
                  key={path}
                  ref={(el) => { if (el) rowRefs.current.set(idx, el); else rowRefs.current.delete(idx); }}
                  style={{
                    cursor: "pointer",
                    background: isFocused ? "var(--accent-muted)" : isMatch ? "rgba(245, 158, 11, 0.1)" : undefined,
                    boxShadow: isFocused ? "inset 2px 0 0 var(--accent)" : undefined,
                  }}
                  onClick={() => { setFocusIndex(idx); onSelectFunction(node.name); }}
                >
                  <td className="mono" style={{ paddingLeft: 12 + depth * 20 }}>
                    <span
                      onClick={(e) => { e.stopPropagation(); if (hasChildren) toggle(path); }}
                      style={{
                        display: "inline-block",
                        width: 18,
                        textAlign: "center",
                        color: "var(--text-muted)",
                        cursor: hasChildren ? "pointer" : "default",
                        userSelect: "none",
                      }}
                    >
                      {hasChildren ? (isExpanded ? "\u25bc" : "\u25b6") : "\u00b7"}
                    </span>
                    <span style={{ color: isMatch ? "var(--warning)" : undefined }}>
                      {node.name}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div
                      title={`Self: ${node.selfFmt} (${node.selfPct.toFixed(1)}%) | Children: ${node.cumFmt} (${childrenPct.toFixed(1)}%)`}
                      style={{
                        display: "flex",
                        height: 12,
                        borderRadius: 2,
                        background: "var(--bg-primary)",
                        overflow: "hidden",
                        minWidth: 80,
                      }}
                    >
                      <div style={{ width: `${node.selfPct}%`, background: "var(--warning)", transition: "width 0.2s" }} />
                      <div style={{ width: `${childrenPct > 0 ? childrenPct : 0}%`, background: "var(--accent)", transition: "width 0.2s" }} />
                    </div>
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>{selfVal}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{cumVal}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{node.calls}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
