import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { TraceData } from "../../api";
import TraceTimeline from "./TraceTimeline";
import TraceGoroutines from "./TraceGoroutines";
import TraceGC from "./TraceGC";
import TraceBlocking from "./TraceBlocking";
import AiAnalysisPanel from "../AiAnalysisPanel";

interface Props {
  profileId: string;
  targetUrl?: string;
}

type Tab = "timeline" | "goroutines" | "gc" | "blocking";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "timeline",   label: "Timeline",   icon: "⬜" },
  { key: "goroutines", label: "Goroutines", icon: "⬜" },
  { key: "gc",         label: "GC",         icon: "⬜" },
  { key: "blocking",   label: "Blocking",   icon: "⬜" },
];

function formatNs(ns: number): string {
  if (ns < 1_000) return `${ns.toFixed(0)}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`;
  return `${(ns / 1_000_000_000).toFixed(2)}s`;
}

export default function TraceViewer({ profileId, targetUrl }: Props) {
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("timeline");
  const [selectedGoroutine, setSelectedGoroutine] = useState<number | null>(null);
  const [aiPanelVisible, setAiPanelVisible] = useState(false);
  const [aiError, setAiError] = useState<string | undefined>();
  const [aiStreamId, setAiStreamId] = useState<string | undefined>();
  const [claudeAvailable, setClaudeAvailable] = useState(false);
  const [permLevel, setPermLevel] = useState<"read-only" | "edit-files">("read-only");
  // Tracks the last AI call so the panel can retry it after the user fixes
  // a precondition (e.g. sets a source directory in the inline form).
  const lastAnalysisRunRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    api.checkClaudeAvailable().then(setClaudeAvailable).catch(() => {});
  }, []);

  const triggerTraceAi = async (mode: string, extra?: Record<string, any>) => {
    const run = async () => {
      setAiError(undefined);
      setPermLevel("read-only");
      setAiPanelVisible(true);
      try {
        const r = await api.startTraceAnalysis({
          targetUrl: targetUrl || "",
          profileId,
          mode: mode as any,
          ...extra,
        });
        setAiStreamId(r.streamId);
      } catch (e: any) {
        setAiError(e?.message || String(e));
      }
    };
    lastAnalysisRunRef.current = run;
    await run();
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    api
      .getTraceData(profileId)
      .then((d) => {
        // Normalize null arrays from Go's JSON marshaling
        d.goroutines = d.goroutines || [];
        d.gcEvents = d.gcEvents || [];
        d.processors = d.processors || [];
        d.blockingSummary = d.blockingSummary || [];
        setData(d);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message ?? "Failed to load trace data");
        setLoading(false);
      });
  }, [profileId]);

  const handleSelectGoroutine = (id: number) => {
    setSelectedGoroutine(id);
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        gap: 16,
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "3px solid var(--border)",
          borderTopColor: "var(--accent)",
          animation: "spin 0.8s linear infinite",
        }} />
        <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Parsing trace data…
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 32, marginBottom: 12, color: "var(--danger)" }}>⚠</div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--danger)" }}>
          Failed to Load Trace
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, maxWidth: 400, margin: "0 auto 16px" }}>
          {error}
        </p>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setLoading(true);
            setError(null);
            api.getTraceData(profileId)
              .then((d) => { setData(d); setLoading(false); })
              .catch((err: Error) => { setError(err.message); setLoading(false); });
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { meta } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {/* Meta summary bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "8px 0 10px",
        flexWrap: "wrap",
        borderBottom: "1px solid var(--border)",
        marginBottom: 0,
      }}>
        {[
          { label: "Duration",    value: formatNs(meta.durationNs) },
          { label: "Goroutines",  value: meta.goroutineCount.toString() },
          { label: "Processors",  value: meta.processorCount.toString() },
          { label: "GC Events",   value: meta.gcCount.toString() },
          { label: "Blocking Locations", value: data.blockingSummary.length.toString() },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {label}
            </span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {value}
            </span>
          </div>
        ))}
        {selectedGoroutine !== null && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Selected:</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px",
                background: "var(--accent-muted)",
                color: "var(--accent)",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
              }}
            >
              G{selectedGoroutine}
              <button
                onClick={() => setSelectedGoroutine(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              transition: "color 0.15s ease",
              fontFamily: "var(--font-sans)",
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.key) (e.currentTarget.style.color = "var(--text-primary)");
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.key) (e.currentTarget.style.color = "var(--text-secondary)");
            }}
          >
            {tab.label}
            {tab.key === "gc" && meta.gcCount > 0 && (
              <span style={{
                marginLeft: 6,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: activeTab === "gc" ? "var(--accent)" : "var(--bg-surface-active)",
                color: activeTab === "gc" ? "white" : "var(--text-secondary)",
                fontSize: 10,
                fontWeight: 700,
                padding: "0 4px",
              }}>
                {meta.gcCount}
              </span>
            )}
            {tab.key === "blocking" && data.blockingSummary.length > 0 && (
              <span style={{
                marginLeft: 6,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: activeTab === "blocking" ? "var(--accent)" : "var(--bg-surface-active)",
                color: activeTab === "blocking" ? "white" : "var(--text-secondary)",
                fontSize: 10,
                fontWeight: 700,
                padding: "0 4px",
              }}>
                {data.blockingSummary.length}
              </span>
            )}
          </button>
        ))}
        {claudeAvailable && (
          <button
            className="btn-ai"
            style={{ marginLeft: "auto", marginRight: 4 }}
            onClick={() => triggerTraceAi("trace-overview")}
          >
            Analyze Trace
          </button>
        )}
      </div>

      {/* Tab content */}
      <div style={{
        flex: 1,
        overflow: activeTab === "timeline" ? "hidden" : "auto",
        paddingTop: activeTab === "timeline" ? 0 : 16,
        display: "flex",
        flexDirection: "column",
      }}>
        {activeTab === "timeline" && (
          <TraceTimeline
            data={data}
            onSelectGoroutine={handleSelectGoroutine}
            onAiAnalyze={claudeAvailable ? triggerTraceAi : undefined}
          />
        )}
        {activeTab === "goroutines" && (
          <TraceGoroutines
            data={data}
            onSelectGoroutine={(id) => {
              handleSelectGoroutine(id);
              setActiveTab("timeline");
            }}
            onAiAnalyze={claudeAvailable ? triggerTraceAi : undefined}
          />
        )}
        {activeTab === "gc" && (
          <TraceGC data={data} onAiAnalyze={claudeAvailable ? triggerTraceAi : undefined} />
        )}
        {activeTab === "blocking" && (
          <TraceBlocking data={data} onAiAnalyze={claudeAvailable ? triggerTraceAi : undefined} />
        )}
      </div>
      <AiAnalysisPanel
        visible={aiPanelVisible}
        onClose={() => { setAiPanelVisible(false); setAiError(undefined); setAiStreamId(undefined); }}
        error={aiError}
        permLevel={permLevel}
        onPermLevelChange={setPermLevel}
        streamId={aiStreamId}
        targetId={targetUrl}
        onRetry={() => lastAnalysisRunRef.current?.()}
        onFollowUp={async (message) => {
          const run = async () => {
            setAiError(undefined);
            try {
              const r = await api.followUpAnalysis({ targetUrl: targetUrl || "", message, permissionLevel: permLevel });
              setAiStreamId(r.streamId);
            } catch (e: any) {
              setAiError(e?.message || String(e));
            }
          };
          lastAnalysisRunRef.current = run;
          await run();
        }}
      />
    </div>
  );
}
