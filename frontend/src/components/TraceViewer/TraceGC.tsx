import type { TraceData } from "../../api";

interface Props {
  data: TraceData;
  onAiAnalyze?: (mode: string, extra?: Record<string, any>) => void;
}

function formatNs(ns: number): string {
  if (ns <= 0) return "—";
  if (ns < 1_000) return `${ns.toFixed(0)}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`;
  return `${(ns / 1_000_000_000).toFixed(3)}s`;
}

function formatRelativeNs(ns: number, totalNs: number): string {
  if (totalNs <= 0) return "—";
  return `${formatNs(ns)} (${((ns / totalNs) * 100).toFixed(2)}%)`;
}

export default function TraceGC({ data, onAiAnalyze }: Props) {
  const gcEvents = data.gcEvents;
  const totalDurationNs = data.meta.durationNs;

  if (gcEvents.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No GC Events</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          No garbage collection events were recorded in this trace.
        </p>
      </div>
    );
  }

  const totalPauseNs = gcEvents.reduce((sum, e) => sum + e.pauseNs, 0);
  const maxPauseNs = Math.max(...gcEvents.map((e) => e.pauseNs));
  const avgPauseNs = totalPauseNs / gcEvents.length;
  const totalGcDuration = gcEvents.reduce((sum, e) => sum + (e.end - e.start), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {onAiAnalyze && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-ai" onClick={() => onAiAnalyze("trace-gc")}>Analyze GC</button>
        </div>
      )}
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {[
          { label: "GC Events", value: gcEvents.length.toString(), accent: "var(--accent)" },
          { label: "Total GC Time", value: formatNs(totalGcDuration), sub: formatRelativeNs(totalGcDuration, totalDurationNs), accent: "var(--warning)" },
          { label: "Total Pause Time", value: formatNs(totalPauseNs), sub: formatRelativeNs(totalPauseNs, totalDurationNs), accent: "var(--danger)" },
          { label: "Avg Pause", value: formatNs(avgPauseNs), accent: "var(--warning)" },
          { label: "Max Pause", value: formatNs(maxPauseNs), accent: "var(--danger)" },
        ].map(({ label, value, sub, accent }) => (
          <div
            key={label}
            className="card"
            style={{ padding: "14px 16px", borderLeft: `3px solid ${accent}` }}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              {label}
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              {value}
            </div>
            {sub && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Pause time distribution bar */}
      {gcEvents.length > 1 && (
        <div className="card">
          <div className="card-header" style={{ marginBottom: 10 }}>
            <span className="card-title">Pause Distribution</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>relative to max pause ({formatNs(maxPauseNs)})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {gcEvents.map((gc, i) => {
              const pct = maxPauseNs > 0 ? (gc.pauseNs / maxPauseNs) * 100 : 0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span className="mono" style={{ color: "var(--text-muted)", width: 28, textAlign: "right", flexShrink: 0 }}>
                    #{i + 1}
                  </span>
                  <div style={{ flex: 1, height: 10, background: "var(--bg-primary)", borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: pct > 75 ? "var(--danger)" : pct > 40 ? "var(--warning)" : "var(--accent)",
                        borderRadius: 2,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <span className="mono" style={{ color: "var(--text-secondary)", width: 60, textAlign: "right", flexShrink: 0 }}>
                    {formatNs(gc.pauseNs)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GC event table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="card-title">GC Events</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{gcEvents.length} events</span>
        </div>
        <div style={{ overflowY: "auto", maxHeight: 400 }}>
          <table className="table">
            <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 1 }}>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Start</th>
                <th>End</th>
                <th style={{ textAlign: "right" }}>GC Duration</th>
                <th style={{ textAlign: "right" }}>Pause</th>
                <th style={{ width: 120 }}>Pause vs Max</th>
              </tr>
            </thead>
            <tbody>
              {gcEvents.map((gc, i) => {
                const dur = gc.end - gc.start;
                const pct = maxPauseNs > 0 ? (gc.pauseNs / maxPauseNs) * 100 : 0;
                const barColor = pct > 75 ? "var(--danger)" : pct > 40 ? "var(--warning)" : "var(--success)";
                return (
                  <tr key={i}>
                    <td className="mono" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                    <td className="mono">{formatNs(gc.start)}</td>
                    <td className="mono">{formatNs(gc.end)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{formatNs(dur)}</td>
                    <td className="mono" style={{ textAlign: "right", color: pct > 75 ? "var(--danger)" : pct > 40 ? "var(--warning)" : "var(--text-secondary)" }}>
                      {formatNs(gc.pauseNs)}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ height: 6, background: "var(--bg-primary)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
