import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ProfileDetail, CallTreeNode, TopFunction } from "../api";
import flamegraph from "d3-flame-graph";
import { select } from "d3-selection";
import TraceViewer from "../components/TraceViewer/TraceViewer";

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
  const [filterPprof, setFilterPprof] = useState(true);
  const [valueMode, setValueMode] = useState<"inuse" | "alloc">("inuse");
  const [refreshing, setRefreshing] = useState(false);
  const [prevHeapSummary, setPrevHeapSummary] = useState<any>(null);
  const [refreshDiff, setRefreshDiff] = useState<any>(null);
  const [showNewAllocs, setShowNewAllocs] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

  const isHeapProfile = profile?.type === "heap" || profile?.type === "allocs";

  const loadProfile = () => {
    if (!id) return;
    const filter = filterPprof ? "pprof" : undefined;
    const vm = valueMode === "alloc" ? "alloc" : undefined;
    api.getProfile(id, { filter, valueMode: vm }).then(setProfile).catch(() => {});
  };

  useEffect(() => { loadProfile(); setPrevHeapSummary(null); setRefreshDiff(null); setShowNewAllocs(false); }, [id]);
  useEffect(() => { loadProfile(); }, [filterPprof, valueMode]);

  const fgData = showNewAllocs && refreshDiff?.flameGraph ? refreshDiff.flameGraph : profile?.flameGraph;

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
      .selfValue(false)
      .setColorMapper((d: any) => {
        // Diff color scheme for new allocations view
        if (showNewAllocs) {
          const v = d.data?.value || 0;
          if (v > 0) return "#ef4444"; // red = new allocations
          if (v < 0) return "#3b82f6"; // blue = freed
          return "#4b5563"; // gray = unchanged
        }
        if (colorMode === "heat") {
          const ratio = d.highlight ? 1 : (d.data?.value || 0) / (fgData?.value || 1);
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
      .datum(fgData)
      .call(chart as any);
  }, [profile, colorMode, inverted, tab, showNewAllocs, refreshDiff]);

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

  // Tag management hooks -- must be before any early returns
  const [tags, setTags] = useState<string[]>([]);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    try { setTags(JSON.parse((profile as any)?.tags || "[]")); } catch { setTags([]); }
  }, [profile]);

  const addTag = async (tag: string) => {
    if (!tag.trim() || !id) return;
    const newTags = [...tags, tag.trim()];
    await api.setTags(id, newTags);
    setTags(newTags);
    setTagInput("");
    setAddingTag(false);
  };

  const removeTag = async (tag: string) => {
    if (!id) return;
    const newTags = tags.filter((t) => t !== tag);
    await api.setTags(id, newTags);
    setTags(newTags);
  };

  if (!profile) {
    return <div className="page-header"><h1>Loading...</h1></div>;
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>&larr; Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1>{profile.type.toUpperCase()} Profile</h1>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                  background: "rgba(99,102,241,0.18)", color: "var(--accent)",
                  border: "1px solid rgba(99,102,241,0.3)", display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                {tag}
                <span onClick={() => removeTag(tag)} style={{ cursor: "pointer", opacity: 0.6, fontSize: 13 }}>&times;</span>
              </span>
            ))}
            {addingTag ? (
              <form onSubmit={(e) => { e.preventDefault(); addTag(tagInput); }} style={{ display: "inline-flex", gap: 4 }}>
                <input
                  className="input"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="tag name"
                  autoFocus
                  style={{ width: 100, padding: "2px 6px", fontSize: 12 }}
                  onBlur={() => { if (!tagInput) setAddingTag(false); }}
                />
              </form>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={() => setAddingTag(true)}
                style={{ padding: "1px 6px", fontSize: 11, lineHeight: 1.4 }}
              >+</button>
            )}
          </div>
          <p>{profile.targetURL} &middot; {new Date(profile.timestamp).toLocaleString()}{profile.durationSec ? ` \u00b7 ${profile.durationSec}s` : ""}</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {profile.type !== "cpu" && profile.type !== "trace" && (
            <button
              className="btn btn-secondary btn-sm"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                if ((profile as any).heapSummary) {
                  setPrevHeapSummary((profile as any).heapSummary);
                }
                try {
                  const result = await api.refreshProfile(profile.id) as any;
                  if (result?.refreshDiff) {
                    setRefreshDiff(result.refreshDiff);
                  }
                  loadProfile();
                } catch {} finally {
                  setRefreshing(false);
                }
              }}
              title="Re-capture this snapshot"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={refreshing ? { animation: "spin 1s linear infinite" } : undefined}>
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => api.exportProfile(profile.id)} title="Download raw profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Heap summary bar */}
      {(profile as any).heapSummary && (
        <div className="card" style={{ marginBottom: 16, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          <HeapStat label="In Use" value={(profile as any).heapSummary.inuseSpace} objects={(profile as any).heapSummary.inuseObjects} accent="var(--success)" prevValue={prevHeapSummary?.inuseSpace} prevObjects={prevHeapSummary?.inuseObjects} />
          <HeapStat label="Total Allocated" value={(profile as any).heapSummary.allocSpace} objects={(profile as any).heapSummary.allocObjects} accent="var(--accent)" prevValue={prevHeapSummary?.allocSpace} prevObjects={prevHeapSummary?.allocObjects} />
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", marginLeft: "auto" }}
            title="Filter out pprof infrastructure overhead (runtime/pprof, text/tabwriter, etc.)"
          >
            <span
              onClick={() => setFilterPprof(!filterPprof)}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: filterPprof ? "var(--accent)" : "var(--border)",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
                display: "inline-block",
                cursor: "pointer",
              }}
            >
              <span style={{
                position: "absolute",
                top: 2,
                left: filterPprof ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: 8,
                background: "white",
                transition: "left 0.2s",
              }} />
            </span>
            Hide profiler noise
          </label>
        </div>
      )}

      {/* Trace type: show TraceViewer */}
      {profile.type === "trace" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => api.exportProfile(profile.id)}>
              Download .trace ({formatTraceSize(profile.size)})
            </button>
          </div>
          <TraceViewer profileId={profile.id} />
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
              {isHeapProfile && (
                <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                  <button className={`btn btn-sm ${valueMode === "inuse" && !showNewAllocs ? "btn-primary" : "btn-secondary"}`} onClick={() => { setValueMode("inuse"); setShowNewAllocs(false); }}>
                    Inuse
                  </button>
                  <button className={`btn btn-sm ${valueMode === "alloc" && !showNewAllocs ? "btn-primary" : "btn-secondary"}`} onClick={() => { setValueMode("alloc"); setShowNewAllocs(false); }}>
                    Alloc
                  </button>
                  {refreshDiff && (
                    <button className={`btn btn-sm ${showNewAllocs ? "btn-primary" : "btn-secondary"}`} onClick={() => setShowNewAllocs(!showNewAllocs)} style={showNewAllocs ? { background: "var(--warning)", color: "#000" } : undefined}>
                      New Allocs
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 12, marginBottom: 16, overflow: "auto" }}>
            <div ref={chartRef} style={{ minHeight: 300 }} />
          </div>

          {((showNewAllocs ? refreshDiff?.topFunctions : profile.topFunctions) || []).length > 0 && (
            <TopFunctionsTable functions={showNewAllocs ? refreshDiff.topFunctions : profile.topFunctions} onSelect={handleSelectFunction} />
          )}
        </>
      )}

      {tab === "calltree" && (showNewAllocs ? refreshDiff?.callTree : profile.callTree) && (
        <CallTree
          root={showNewAllocs ? refreshDiff.callTree : profile.callTree}
          onSelectFunction={handleSelectFunction}
        />
      )}
      </>}
    </div>
  );
}

function HeapStat({ label, value, objects, accent, prevValue, prevObjects }: {
  label: string; value: number; objects: number; accent: string;
  prevValue?: number; prevObjects?: number;
}) {
  const valueDelta = prevValue != null ? value - prevValue : null;
  const objectsDelta = prevObjects != null ? objects - prevObjects : null;

  const deltaColor = (d: number) => d > 0 ? "var(--danger)" : d < 0 ? "var(--success)" : "var(--text-muted)";
  const deltaPrefix = (d: number) => d > 0 ? "+" : "";

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: accent }}>{formatTraceSize(value)}</span>
        {valueDelta != null && (
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: deltaColor(valueDelta) }}>
            {deltaPrefix(valueDelta)}{formatTraceSize(valueDelta)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{objects.toLocaleString()} objects</span>
        {objectsDelta != null && (
          <span style={{ fontSize: 11, color: deltaColor(objectsDelta) }}>
            {deltaPrefix(objectsDelta)}{objectsDelta.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

function formatTraceSize(bytes: number): string {
  if (bytes >= 1 << 30) return (bytes / (1 << 30)).toFixed(1) + " GB";
  if (bytes >= 1 << 20) return (bytes / (1 << 20)).toFixed(1) + " MB";
  if (bytes >= 1 << 10) return (bytes / (1 << 10)).toFixed(1) + " KB";
  return bytes + " B";
}

type TopSortKey = "name" | "flat" | "flatPct" | "cum" | "cumPct" | "allocFlat" | "allocFlatPct" | "allocCum" | "allocCumPct";

function TopFunctionsTable({ functions, onSelect }: {
  functions: TopFunction[];
  onSelect: (name: string) => void;
}) {
  const [sortKey, setSortKey] = useState<TopSortKey>("cumPct");
  const [sortAsc, setSortAsc] = useState(false);
  const hasAlloc = functions.some((f) => f.allocFlat != null);

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
      case "allocFlat": cmp = (a.allocFlatPercent ?? 0) - (b.allocFlatPercent ?? 0); break;
      case "allocFlatPct": cmp = (a.allocFlatPercent ?? 0) - (b.allocFlatPercent ?? 0); break;
      case "allocCum": cmp = (a.allocCumPercent ?? 0) - (b.allocCumPercent ?? 0); break;
      case "allocCumPct": cmp = (a.allocCumPercent ?? 0) - (b.allocCumPercent ?? 0); break;
    }
    return sortAsc ? cmp : -cmp;
  });

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <span className="card-title">Top Functions</span>
        {hasAlloc && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 12 }}>Inuse = current live memory, Alloc = total ever allocated</span>}
      </div>
      <div style={{ overflow: "auto" }}>
        <table className="table" style={{ minWidth: hasAlloc ? 900 : undefined }}>
          <thead>
            <tr>
              <th onClick={() => toggle("name")} style={{ minWidth: 250 }}>Function{ind("name")}</th>
              <th onClick={() => toggle("flat")} style={{ textAlign: "right", width: 80 }}>{hasAlloc ? "Inuse" : "Flat"}{ind("flat")}</th>
              <th onClick={() => toggle("flatPct")} style={{ textAlign: "right", width: 60 }}>{hasAlloc ? "Inuse %" : "Flat %"}{ind("flatPct")}</th>
              <th onClick={() => toggle("cum")} style={{ textAlign: "right", width: 80 }}>{hasAlloc ? "Inuse Cum" : "Cum"}{ind("cum")}</th>
              <th onClick={() => toggle("cumPct")} style={{ textAlign: "right", width: 60 }}>{hasAlloc ? "Cum %" : "Cum %"}{ind("cumPct")}</th>
              {hasAlloc && <th onClick={() => toggle("allocFlat")} style={{ textAlign: "right", width: 80 }}>Alloc{ind("allocFlat")}</th>}
              {hasAlloc && <th onClick={() => toggle("allocFlatPct")} style={{ textAlign: "right", width: 60 }}>Alloc %{ind("allocFlatPct")}</th>}
              {hasAlloc && <th onClick={() => toggle("allocCum")} style={{ textAlign: "right", width: 80 }}>Alloc Cum{ind("allocCum")}</th>}
              {hasAlloc && <th onClick={() => toggle("allocCumPct")} style={{ textAlign: "right", width: 60 }}>Cum %{ind("allocCumPct")}</th>}
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
                {hasAlloc && <td className="mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>{fn.allocFlat}</td>}
                {hasAlloc && <td className="mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>{fn.allocFlatPercent?.toFixed(1)}%</td>}
                {hasAlloc && <td className="mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>{fn.allocCum}</td>}
                {hasAlloc && <td className="mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>{fn.allocCumPercent?.toFixed(1)}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const hasAlloc = root.children?.some((c) => c.allocCumFmt != null) ?? false;
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
              <th onClick={() => toggleSort("name")} style={{ minWidth: 250 }}>Function{sortIndicator("name")}</th>
              <th style={{ width: 120 }}>Distribution</th>
              <th onClick={() => toggleSort("self")} style={{ textAlign: "right", width: 80 }}>{hasAlloc ? "Inuse" : "Self"}{sortIndicator("self")}</th>
              <th onClick={() => toggleSort("cum")} style={{ textAlign: "right", width: 80 }}>{hasAlloc ? "Inuse Cum" : "Cum"}{sortIndicator("cum")}</th>
              {hasAlloc && <th style={{ textAlign: "right", width: 80 }}>Alloc</th>}
              {hasAlloc && <th style={{ textAlign: "right", width: 80 }}>Alloc Cum</th>}
              <th onClick={() => toggleSort("calls")} style={{ textAlign: "right", width: 70 }} title="Number of profiler samples (not exact invocation count)">Samples{sortIndicator("calls")}</th>
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
                  {hasAlloc && <td className="mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>{node.allocSelfFmt || "\u2014"}</td>}
                  {hasAlloc && <td className="mono" style={{ textAlign: "right", color: "var(--text-muted)" }}>{node.allocCumFmt || "\u2014"}</td>}
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
