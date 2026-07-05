import { technicalInputProps } from "../inputProps";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import LanguageBadge from "./LanguageBadge";
import type { Language } from "../api";

interface Props {
  onConnected: (targetId: string) => void;
}

interface DiscoveryState {
  currentContext: string;
  contexts: { name: string; cluster: string; namespace: string; isCurrent: boolean }[];
  namespaces: string[];
  pods: any[];
}

export default function K8sConnectWizard({ onConnected }: Props) {
  const [data, setData] = useState<DiscoveryState | null>(null);
  const [selectedCtx, setSelectedCtx] = useState("");
  const [selectedNs, setSelectedNs] = useState("");
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState<"all" | "go" | "java" | "unknown">("go");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");
  // `data` via a ref so discover() can tell whether it's the initial fetch
  // (loading=true, big spinner) or a subsequent refresh (refreshing=true,
  // inline spinner) without re-creating the callback on every state change.
  const hasDataRef = useRef(false);
  const discover = useCallback(async (ctx?: string, ns?: string, q?: string) => {
    if (hasDataRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const result = await api.discoverK8s(ctx || selectedCtx, ns ?? selectedNs, q ?? search);
      setData(result);
      hasDataRef.current = true;
      if (!ctx && !selectedCtx && result.currentContext) {
        setSelectedCtx(result.currentContext);
      }
    } catch (e: any) {
      setError(e.message || "Failed to connect to Kubernetes. Is kubectl configured?");
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedCtx, selectedNs, search]);

  // Initial load
  useEffect(() => {
    discover("", "", "");
  }, []);

  const changeContext = (ctx: string) => {
    setSelectedCtx(ctx);
    setSelectedNs("");
    discover(ctx, "", search);
  };

  const changeNamespace = (ns: string) => {
    setSelectedNs(ns);
    discover(selectedCtx, ns, search);
  };

  const doSearch = () => {
    discover(selectedCtx, selectedNs, search);
  };

  const connectPod = async (pod: any) => {
    const container = pod.containers?.[0];
    const port = container?.profilingPort || (pod.language === "java" ? 9999 : 6060);
    setConnecting(pod.name);
    setError("");
    try {
      const target = await api.connectK8sPod(selectedCtx, pod.namespace, pod.name, port, pod.language);
      onConnected(target.id);
    } catch (e: any) {
      setError(e.message || "Connection failed");
    }
    setConnecting(null);
  };

  if (loading && !data) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 16, color: "var(--text-muted)" }}>
        <span style={{
          display: "inline-block", width: 14, height: 14, boxSizing: "border-box",
          border: "2px solid var(--border)", borderTopColor: "var(--accent, #8b5cf6)",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        Connecting to Kubernetes...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={() => discover("", "", "")}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const filteredPods = data.pods.filter((p) => langFilter === "all" || p.language === langFilter);

  return (
    <div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</p>}

      {/* Controls row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Context */}
        {data.contexts.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Context:</span>
            <CustomDropdown
              value={selectedCtx || data.currentContext}
              options={data.contexts.map((c) => ({ value: c.name, label: c.name + (c.isCurrent ? " (current)" : "") }))}
              onChange={changeContext}
              searchable
              searchPlaceholder="Filter contexts…"
            />
          </div>
        )}

        {/* Namespace */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Namespace:</span>
          <CustomDropdown
            value={selectedNs}
            options={[{ value: "", label: "All namespaces" }, ...data.namespaces.map((ns) => ({ value: ns, label: ns }))]}
            onChange={changeNamespace}
            searchable
            searchPlaceholder="Filter namespaces…"
          />
        </div>

        {/* Search */}
        <input
          className="input"
          style={{ flex: 1, minWidth: 120 }}
          placeholder="Search pods..."
          value={search}
          {...technicalInputProps}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <button className="btn btn-secondary btn-sm" onClick={doSearch} disabled={loading || refreshing}>
          {loading || refreshing ? "..." : "Refresh"}
        </button>
      </div>

      {/* Language filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {(["go", "java", "unknown", "all"] as const).map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${langFilter === f ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setLangFilter(f)}
            style={{ fontSize: 11 }}
          >
            {f === "all" ? "All" : f === "unknown" ? "Other" : f === "go" ? "Go" : "Java"}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center", marginLeft: 4 }}>
          {filteredPods.length} / {data.pods.length} pods
        </span>
      </div>

      {/* Pod list — swapped for an inline spinner while refreshing after a
          context or namespace change. The big "Connecting to Kubernetes…"
          spinner above is reserved for the first mount. */}
      {refreshing ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: 24,
          color: "var(--text-muted)", fontSize: 13, justifyContent: "center",
        }}>
          <span style={{
            display: "inline-block", width: 16, height: 16, boxSizing: "border-box",
            border: "2px solid var(--border)", borderTopColor: "var(--accent, #8b5cf6)",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          Loading from cluster…
        </div>
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 400, overflow: "auto" }}>
        {filteredPods.map((pod) => {
          const port = pod.containers?.[0]?.profilingPort;
          const proto = pod.language === "java" ? "JMX" : "pprof";
          return (
            <div key={pod.name + pod.namespace} className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: pod.status === "Running" ? "var(--success)" : pod.status === "Pending" ? "var(--warning, #f59e0b)" : "var(--danger)",
              }} />
              <LanguageBadge language={(pod.language === "java" ? "java" : "go") as Language} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pod.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {selectedNs === "" && <span style={{ marginRight: 6 }}>{pod.namespace}</span>}
                  {pod.containers?.[0]?.image?.split("/").pop() || ""} · {pod.age}
                </div>
              </div>
              {port ? (
                <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {proto} :{port}
                </span>
              ) : null}
              <button
                className="btn btn-primary btn-sm"
                disabled={connecting === pod.name || pod.status !== "Running"}
                onClick={() => connectPod(pod)}
              >
                {connecting === pod.name ? "..." : "Connect"}
              </button>
            </div>
          );
        })}
        {filteredPods.length === 0 && !loading && (
          <span style={{ color: "var(--text-muted)", padding: 16, textAlign: "center" }}>
            No pods found{langFilter !== "all" ? ` matching "${langFilter}"` : ""}. Try a different filter or namespace.
          </span>
        )}
      </div>
      )}
    </div>
  );
}

// Reusable custom dropdown with optional typeahead filter.
function CustomDropdown({ value, options, onChange, searchable, searchThreshold, searchPlaceholder }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  searchable?: boolean;
  searchThreshold?: number;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  const showSearch = !!searchable && options.length >= (searchThreshold ?? 6);

  // Reset the query and auto-focus the search input each time the popover
  // opens. Reopening with a stale filter would confuse the user.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    if (showSearch) {
      // Defer focus until the input is actually in the DOM.
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, showSearch]);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? options.filter((o) => o.label.toLowerCase().includes(needle))
    : options;
  // Pin the current selection on top if it would otherwise be filtered out,
  // so the user doesn't lose sight of their current pick while typing.
  const pinnedSelected = selected && needle && !matches.some((m) => m.value === selected.value)
    ? selected
    : undefined;

  return (
    <div style={{ position: "relative" }}>
      <button
        className="input"
        style={{
          fontSize: 12, padding: "4px 24px 4px 8px", width: "auto", minWidth: 120,
          cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center",
        }}
        onClick={() => setOpen(!open)}
      >
        {selected?.label || value || options[0]?.label}
        <span style={{ position: "absolute", right: 8, fontSize: 8, color: "var(--text-muted)" }}>{open ? "\u25b2" : "\u25bc"}</span>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
            background: "var(--bg-surface, #1a1a2e)", border: "1px solid var(--border)",
            borderRadius: 6, padding: 4, minWidth: 220, maxHeight: 320, overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            display: "flex", flexDirection: "column",
          }}>
            {showSearch && (
              <input
                ref={searchRef}
                type="text"
                className="input"
                placeholder={searchPlaceholder ?? "Filter…"}
                aria-label={searchPlaceholder ?? "Filter"}
                value={query}
                {...technicalInputProps}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
                style={{
                  fontSize: 12, padding: "4px 8px", margin: 4, marginBottom: 6,
                  flexShrink: 0,
                }}
              />
            )}
            {pinnedSelected && (
              <>
                <OptionRow option={pinnedSelected} active onPick={(v) => { onChange(v); setOpen(false); }} />
                <div style={{ height: 1, background: "var(--border)", margin: "4px 2px" }} />
              </>
            )}
            {matches.map((opt) => (
              <OptionRow
                key={opt.value}
                option={opt}
                active={opt.value === value}
                onPick={(v) => { onChange(v); setOpen(false); }}
              />
            ))}
            {matches.length === 0 && !pinnedSelected && (
              <span style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>
                No matches
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OptionRow({ option, active, onPick }: {
  option: { value: string; label: string };
  active: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "6px 10px", fontSize: 12, border: "none", borderRadius: 4, cursor: "pointer",
        background: active ? "var(--accent-muted, rgba(139,92,246,0.15))" : "none",
        color: active ? "var(--accent, #8b5cf6)" : "var(--text-primary)",
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={(e) => { if (!active) (e.target as HTMLElement).style.background = "var(--bg-hover, #2a2a3e)"; }}
      onMouseLeave={(e) => { if (!active) (e.target as HTMLElement).style.background = "none"; }}
      onClick={() => onPick(option.value)}
    >
      {option.label}
    </button>
  );
}
