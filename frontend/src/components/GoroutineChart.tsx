import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api";

interface DataPoint {
  time: number;
  count: number;
}

interface GoroutineGroup {
  count: number;
  state: string;
  topFrame: string;
  location: string;
  stack: string;
}

const MAX_POINTS = 7200;
const GOROUTINE_THRESHOLD = 1000;
const COLOR = "#f59e0b";
const THRESHOLD_COLOR = "#ef4444";

export default function GoroutineChart({ targetId, active, windowMs = 300000 }: { targetId: string; active: boolean; windowMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<DataPoint[]>([]);
  const lastTimestampRef = useRef<string>("");
  const [latest, setLatest] = useState<DataPoint | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; point: DataPoint } | null>(null);
  const [groups, setGroups] = useState<{ total: number; groups: GoroutineGroup[] } | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const initializedRef = useRef(false);

  const fetchHistory = useCallback(async (since?: string) => {
    try {
      const history = await api.getMemStatsHistory(targetId, since);
      const points: DataPoint[] = history.points.map((p) => ({
        time: new Date(p.timestamp).getTime(),
        count: (p as any).numGoroutines || 0,
      }));

      if (points.length > 0) {
        dataRef.current = [...dataRef.current, ...points].slice(-MAX_POINTS);
        setLatest(dataRef.current[dataRef.current.length - 1]);
      }
      if (history.points.length > 0) {
        lastTimestampRef.current = history.points[history.points.length - 1].timestamp;
      }
    } catch {}
  }, [targetId]);

  useEffect(() => {
    if (!active) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      dataRef.current = [];
      lastTimestampRef.current = "";
      fetchHistory();
    }
  }, [active, fetchHistory]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      fetchHistory(lastTimestampRef.current || undefined);
    }, 1000);
    return () => clearInterval(interval);
  }, [active, fetchHistory]);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const resp = await api.getGoroutineGroups(targetId);
      setGroups(resp);
      setExpandedIdx(null);
    } catch {} finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (active) loadGroups();
  }, [active, targetId]);

  // Draw chart
  useEffect(() => {
    if (!latest) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 10, right: 16, bottom: 30, left: 60 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const cutoff = Date.now() - windowMs;
    const data = dataRef.current.filter((d) => d.time >= cutoff);
    if (data.length < 2) return;

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    const timeMin = data[0].time;
    const timeMax = data[data.length - 1].time;
    const timeRange = Math.max(timeMax - timeMin, 1000);

    let valueMax = Math.max(GOROUTINE_THRESHOLD * 1.1, ...data.map((d) => d.count)) * 1.1;

    const xScale = (t: number) => pad.left + ((t - timeMin) / timeRange) * chartW;
    const yScale = (v: number) => pad.top + chartH - (v / valueMax) * chartH;

    // Grid
    ctx.strokeStyle = "#1f1f2e";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#5a5a6e";
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = (valueMax / yTicks) * i;
      const y = yScale(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(Math.round(v).toString(), pad.left - 8, y + 4);
    }

    // X axis
    ctx.textAlign = "center";
    const xTicks = Math.min(6, data.length);
    for (let i = 0; i < xTicks; i++) {
      const idx = Math.floor((i / (xTicks - 1)) * (data.length - 1));
      ctx.fillText(new Date(data[idx].time).toLocaleTimeString(), xScale(data[idx].time), h - 8);
    }

    // Threshold line
    const thresholdY = yScale(GOROUTINE_THRESHOLD);
    if (thresholdY > pad.top && thresholdY < pad.top + chartH) {
      ctx.strokeStyle = THRESHOLD_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, thresholdY);
      ctx.lineTo(w - pad.right, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = THRESHOLD_COLOR;
      ctx.textAlign = "left";
      ctx.fillText(`${GOROUTINE_THRESHOLD}`, pad.left + 4, thresholdY - 4);
    }

    // Line
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = xScale(data[i].time);
      const y = yScale(data[i].count);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Hover
    if (hoverInfo) {
      ctx.strokeStyle = "#5a5a6e";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hoverInfo.x, pad.top);
      ctx.lineTo(hoverInfo.x, pad.top + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [latest, hoverInfo, windowMs]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const cutoff = Date.now() - windowMs;
    const data = dataRef.current.filter((d) => d.time >= cutoff);
    if (data.length < 2) return;
    const ratio = (x - 60) / (rect.width - 76);
    const idx = Math.round(ratio * (data.length - 1));
    if (idx >= 0 && idx < data.length) {
      setHoverInfo({ x, point: data[idx] });
    }
  };

  // Warnings
  const isHigh = latest && latest.count > GOROUTINE_THRESHOLD;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, fontSize: 13 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 3, borderRadius: 1, background: COLOR, display: "inline-block" }} />
          <span style={{ color: "var(--text-secondary)" }}>Goroutines</span>
          <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {latest ? latest.count : "\u2014"}
          </span>
        </span>
        {isHigh && <span className="badge badge-danger">High goroutine count</span>}
      </div>

      <div className="card" style={{ padding: 0, position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: 200, display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
        />
        {hoverInfo && (
          <div style={{
            position: "absolute",
            left: Math.min(hoverInfo.x + 12, (canvasRef.current?.getBoundingClientRect().width ?? 300) - 160),
            top: 12,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "8px 12px",
            fontSize: 12,
            pointerEvents: "none",
            zIndex: 10,
          }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{new Date(hoverInfo.point.time).toLocaleTimeString()}</div>
            <div style={{ color: COLOR }}>Goroutines: {hoverInfo.point.count}</div>
          </div>
        )}
      </div>

      {/* Goroutine groups table */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
            Goroutine Groups {groups ? `(${groups.total} total)` : ""}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={loadGroups} disabled={loadingGroups}>
            {loadingGroups ? "Loading..." : "Refresh"}
          </button>
        </div>
        {groups && groups.groups.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Count</th>
                  <th style={{ width: 100 }}>State</th>
                  <th>Top Frame</th>
                </tr>
              </thead>
              <tbody>
                {groups.groups.map((g, i) => (
                  <>
                    <tr key={i} style={{ cursor: "pointer" }} onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
                      <td className="mono" style={{ fontWeight: 600 }}>{g.count}</td>
                      <td><span className="badge badge-info">{g.state}</span></td>
                      <td className="mono" style={{ fontSize: 12 }}>{g.topFrame}</td>
                    </tr>
                    {expandedIdx === i && (
                      <tr key={`${i}-stack`}>
                        <td colSpan={3} style={{ padding: 0 }}>
                          <pre style={{ background: "var(--bg-primary)", padding: 12, margin: 0, fontSize: 11, fontFamily: "var(--font-mono)", overflow: "auto", maxHeight: 200 }}>{g.stack}</pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
