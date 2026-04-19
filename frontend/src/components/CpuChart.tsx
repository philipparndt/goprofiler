import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api";

interface DataPoint {
  time: number;
  cpuPercent: number;
}

const MAX_POINTS = 7200;
const CPU_COLOR = "#f59e0b";

export default function CpuChart({ targetId, active, windowMs = 300000 }: { targetId: string; active: boolean; windowMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<DataPoint[]>([]);
  const lastTimestampRef = useRef<string>("");
  const [latest, setLatest] = useState<DataPoint | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; point: DataPoint } | null>(null);
  const initializedRef = useRef(false);

  const mergeHistory = useCallback((points: DataPoint[]) => {
    if (points.length > 0) {
      dataRef.current = [...dataRef.current, ...points].slice(-MAX_POINTS);
      setLatest(dataRef.current[dataRef.current.length - 1]);
    }
  }, []);

  const fetchHistory = useCallback(async (since?: string) => {
    try {
      const history = await api.getCpuHistory(targetId, since);
      const points: DataPoint[] = history.points.map((p) => ({
        time: new Date(p.timestamp).getTime(),
        cpuPercent: p.cpuPercent,
      }));

      mergeHistory(points);

      if (history.points.length > 0) {
        lastTimestampRef.current = history.points[history.points.length - 1].timestamp;
      }
    } catch {
      // Silently ignore
    }
  }, [targetId, mergeHistory]);

  // Initial load
  useEffect(() => {
    if (!active) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      dataRef.current = [];
      lastTimestampRef.current = "";
      fetchHistory();
    }
  }, [active, fetchHistory]);

  // Incremental polling (5s to match backend interval)
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      fetchHistory(lastTimestampRef.current || undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [active, fetchHistory]);

  // Draw the chart
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
    const pad = { top: 10, right: 16, bottom: 30, left: 70 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const allData = dataRef.current;
    const cutoff = Date.now() - windowMs;
    const data = allData.filter((d) => d.time >= cutoff);
    if (data.length < 2) return;

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    const timeMin = data[0].time;
    const timeMax = data[data.length - 1].time;
    const timeRange = Math.max(timeMax - timeMin, 1000);

    let valueMax = 0;
    for (const p of data) {
      valueMax = Math.max(valueMax, p.cpuPercent);
    }
    valueMax = Math.max(valueMax * 1.1, 10); // at least 10% scale

    const xScale = (t: number) => pad.left + ((t - timeMin) / timeRange) * chartW;
    const yScale = (v: number) => pad.top + chartH - (v / valueMax) * chartH;

    // Grid + Y axis
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
      ctx.fillText(v.toFixed(0) + "%", pad.left - 8, y + 4);
    }

    // X axis
    ctx.textAlign = "center";
    const xTicks = Math.min(6, data.length);
    for (let i = 0; i < xTicks; i++) {
      const idx = Math.floor((i / (xTicks - 1)) * (data.length - 1));
      const p = data[idx];
      ctx.fillText(new Date(p.time).toLocaleTimeString(), xScale(p.time), h - 8);
    }

    // CPU line
    ctx.strokeStyle = CPU_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = xScale(data[i].time);
      const y = yScale(data[i].cpuPercent);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill area under line
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = CPU_COLOR;
    ctx.lineTo(xScale(data[data.length - 1].time), pad.top + chartH);
    ctx.lineTo(xScale(data[0].time), pad.top + chartH);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Hover crosshair
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
    const padLeft = 70, padRight = 16;
    const chartW = rect.width - padLeft - padRight;
    const cutoff = Date.now() - windowMs;
    const data = dataRef.current.filter((d) => d.time >= cutoff);
    if (data.length < 2) return;

    const ratio = (x - padLeft) / chartW;
    const idx = Math.round(ratio * (data.length - 1));
    if (idx >= 0 && idx < data.length) {
      setHoverInfo({ x, point: data[idx] });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 20, marginBottom: 12, fontSize: 13 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 3, borderRadius: 1, background: CPU_COLOR, display: "inline-block" }} />
          <span style={{ color: "var(--text-secondary)" }}>CPU</span>
          <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {latest != null ? latest.cpuPercent.toFixed(1) + "%" : "\u2014"}
          </span>
        </span>
      </div>

      <div className="card" style={{ padding: 0, position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: 280, display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
        />
        {hoverInfo && (
          <div style={{
            position: "absolute",
            left: Math.min(hoverInfo.x + 12, (canvasRef.current?.getBoundingClientRect().width ?? 300) - 180),
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
            <div style={{ color: CPU_COLOR }}>CPU: {hoverInfo.point.cpuPercent.toFixed(1)}%</div>
          </div>
        )}
      </div>
    </div>
  );
}
