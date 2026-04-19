import { useState, useEffect } from "react";
import { api } from "../api";
import LanguageBadge from "./LanguageBadge";
import type { Language } from "../api";

interface Props {
  onConnected: (targetId: string) => void;
}

type Step = "context" | "namespace" | "pods";

export default function K8sConnectWizard({ onConnected }: Props) {
  const [step, setStep] = useState<Step>("context");
  const [contexts, setContexts] = useState<{ name: string; cluster: string; namespace: string; isCurrent: boolean }[]>([]);
  const [selectedCtx, setSelectedCtx] = useState("");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNs, setSelectedNs] = useState("");
  const [pods, setPods] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<"all" | "go" | "java" | "unknown">("go");
  const [nsDropdownOpen, setNsDropdownOpen] = useState(false);
  const [error, setError] = useState("");

  // Load contexts on mount
  useEffect(() => {
    setLoading(true);
    api.listK8sContexts().then((ctxs) => {
      setContexts(ctxs || []);
      const current = ctxs?.find((c) => c.isCurrent);
      if (current) {
        setSelectedCtx(current.name);
        const ns = current.namespace || "default";
        setSelectedNs(ns);
        // Load namespaces in background for the dropdown
        api.listK8sNamespaces(current.name).then((nsList) => setNamespaces(nsList || [])).catch(() => {});
        setStep("pods");
        loadPods(current.name, ns, "");
      }
      setLoading(false);
    }).catch((e) => {
      setError(e.message || "Failed to load kubeconfig. Is kubectl configured?");
      setLoading(false);
    });
  }, []);

  const loadNamespaces = async (ctx: string) => {
    setLoading(true);
    try {
      const ns = await api.listK8sNamespaces(ctx);
      setNamespaces(ns || []);
      setStep("namespace");
    } catch (e: any) {
      setError(e.message || "Failed to list namespaces");
    }
    setLoading(false);
  };

  const loadPods = async (ctx: string, ns: string, q: string) => {
    setLoading(true);
    setError("");
    try {
      const p = await api.listK8sPods(ctx, ns, q);
      setPods(p || []);
      setStep("pods");
    } catch (e: any) {
      setError(e.message || "Failed to list pods");
    }
    setLoading(false);
  };

  const connectPod = async (pod: any) => {
    const container = pod.containers?.[0];
    const port = container?.profilingPort || (pod.language === "java" ? 9999 : 6060);
    setConnecting(pod.name);
    setError("");
    try {
      const target = await api.connectK8sPod(selectedCtx, selectedNs, pod.name, port, pod.language);
      onConnected(target.id);
    } catch (e: any) {
      setError(e.message || "Connection failed");
    }
    setConnecting(null);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, fontSize: 12, color: "var(--text-muted)" }}>
        <button
          className="btn btn-sm btn-secondary"
          style={{ fontSize: 11, padding: "2px 8px" }}
          onClick={() => setStep("context")}
          disabled={step === "context"}
        >
          {selectedCtx || "Context"}
        </button>
        {selectedNs && (
          <>
            <span>/</span>
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => { setStep("namespace"); loadNamespaces(selectedCtx); }}
              disabled={step === "namespace"}
            >
              {selectedNs}
            </button>
          </>
        )}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</p>}

      {/* Context selection */}
      {step === "context" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {loading ? <span style={{ color: "var(--text-muted)" }}>Loading contexts...</span> : (
            contexts.map((ctx) => (
              <button
                key={ctx.name}
                className="card"
                style={{ padding: "10px 14px", cursor: "pointer", textAlign: "left", border: "1px solid var(--border)" }}
                onClick={() => { setSelectedCtx(ctx.name); setSelectedNs(ctx.namespace || "default"); loadPods(ctx.name, ctx.namespace || "default", ""); }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{ctx.name} {ctx.isCurrent && <span style={{ fontSize: 10, color: "var(--accent)" }}>(current)</span>}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>cluster: {ctx.cluster}, ns: {ctx.namespace || "default"}</div>
              </button>
            ))
          )}
          {!loading && contexts.length === 0 && <span style={{ color: "var(--text-muted)" }}>No Kubernetes contexts found. Run `kubectl config get-contexts`.</span>}
        </div>
      )}

      {/* Namespace selection */}
      {step === "namespace" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {namespaces.map((ns) => (
            <button
              key={ns}
              className={`btn btn-sm ${ns === selectedNs ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setSelectedNs(ns); loadPods(selectedCtx, ns, ""); }}
            >{ns}</button>
          ))}
        </div>
      )}

      {/* Pod list */}
      {step === "pods" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Namespace:</span>
              <button
                className="input"
                style={{
                  fontSize: 12, padding: "4px 12px 4px 8px", width: "auto", minWidth: 120,
                  cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 6,
                }}
                onClick={() => setNsDropdownOpen(!nsDropdownOpen)}
              >
                <span style={{ flex: 1 }}>{selectedNs}</span>
                <span style={{ fontSize: 8, color: "var(--text-muted)" }}>{nsDropdownOpen ? "\u25b2" : "\u25bc"}</span>
              </button>
              {nsDropdownOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setNsDropdownOpen(false)} />
                  <div style={{
                    position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
                    background: "var(--bg-surface, #1a1a2e)", border: "1px solid var(--border)",
                    borderRadius: 6, padding: 4, minWidth: 180, maxHeight: 240, overflowY: "auto",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  }}>
                    {(namespaces.length > 0 ? namespaces : [selectedNs]).map((ns) => (
                      <button
                        key={ns}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "6px 10px", fontSize: 12, border: "none", borderRadius: 4, cursor: "pointer",
                          background: ns === selectedNs ? "var(--accent-muted, rgba(139,92,246,0.15))" : "none",
                          color: ns === selectedNs ? "var(--accent, #8b5cf6)" : "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                        onMouseEnter={(e) => { if (ns !== selectedNs) (e.target as HTMLElement).style.background = "var(--bg-hover, #2a2a3e)"; }}
                        onMouseLeave={(e) => { if (ns !== selectedNs) (e.target as HTMLElement).style.background = "none"; }}
                        onClick={() => {
                          setSelectedNs(ns);
                          setNsDropdownOpen(false);
                          loadPods(selectedCtx, ns, search);
                        }}
                      >
                        {ns}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Search pods..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadPods(selectedCtx, selectedNs, search)}
            />
            <button className="btn btn-secondary btn-sm" onClick={() => loadPods(selectedCtx, selectedNs, search)} disabled={loading}>
              {loading ? "..." : "Refresh"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {(["go", "java", "unknown", "all"] as const).map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${langFilter === f ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setLangFilter(f)}
                style={{ fontSize: 11, textTransform: "capitalize" }}
              >
                {f === "all" ? "All" : f === "unknown" ? "Other" : f === "go" ? "Go" : "Java"}
              </button>
            ))}
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4, alignSelf: "center" }}>
              {pods.filter((p: any) => langFilter === "all" || p.language === langFilter).length} / {pods.length} pods
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 400, overflow: "auto" }}>
            {pods.filter((pod: any) => langFilter === "all" || pod.language === langFilter).map((pod: any) => (
              <div key={pod.name} className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: pod.status === "Running" ? "var(--success)" : pod.status === "Pending" ? "var(--warning, #f59e0b)" : "var(--danger)",
                }} />
                <LanguageBadge language={(pod.language === "java" ? "java" : pod.language === "go" ? "go" : "go") as Language} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pod.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {pod.containers?.[0]?.image?.split("/").pop() || ""} · {pod.age}
                  </div>
                </div>
                {(() => {
                  const port = pod.containers?.[0]?.profilingPort;
                  const proto = pod.language === "java" ? "JMX" : "pprof";
                  return port ? (
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {proto} :{port}
                    </span>
                  ) : null;
                })()}
                <button
                  className="btn btn-primary btn-sm"
                  disabled={connecting === pod.name || pod.status !== "Running"}
                  onClick={() => connectPod(pod)}
                >
                  {connecting === pod.name ? "..." : "Connect"}
                </button>
              </div>
            ))}
            {pods.length === 0 && !loading && <span style={{ color: "var(--text-muted)", padding: 16 }}>No pods found.</span>}
          </div>
        </>
      )}
    </div>
  );
}
