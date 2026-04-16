import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api";

interface DataPoint {
  time: number;
  heapAlloc: number;
  heapSys: number;
  sys: number;
}

interface GCEvent {
  time: number;
  pauseNs: number;
  gcNum: number;
}

const MAX_POINTS = 300;
const COLORS = {
  heapAlloc: "#22c55e",
  heapSys: "#6366f1",
  sys: "#6b7280",
  gc: "#ef4444",
};

export default function MemoryChart({ targetId, active }: { targetId: string; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<DataPoint[]>([]);
  const gcEventsRef = useRef<GCEvent[]>([]);
  const lastTimestampRef = useRef<string>("");
  const [latest, setLatest] = useState<DataPoint | null>(null);
  const [gcStats, setGcStats] = useState({ count: 0, avgPauseMs: 0, totalPauseMs: 0 });
  const [hoverInfo, setHoverInfo] = useState<{ x: number; point: DataPoint } | null>(null);
  const initializedRef = useRef(false);

  const mergeHistory = useCallback((points: DataPoint[], gcEvents: GCEvent[]) => {
    if (points.length > 0) {
      dataRef.current = [...dataRef.current, ...points].slice(-MAX_POINTS);
      setLatest(dataRef.current[dataRef.current.length - 1]);
    }
    if (gcEvents.length > 0) {
      gcEventsRef.current = [...gcEventsRef.current, ...gcEvents].slice(-MAX_POINTS);
    }
    // Update GC stats
    const events = gcEventsRef.current;
    if (events.length > 0) {
      const totalPause = events.reduce((sum, e) => sum + e.pauseNs, 0);
      setGcStats({
        count: events.length,
        avgPauseMs: totalPause / events.length / 1e6,
        totalPauseMs: totalPause / 1e6,
      });
    }
  }, []);

  const fetchHistory = useCallback(async (since?: string) => {
    try {
      const history = await api.getMemStatsHistory(targetId, since);
      const points: DataPoint[] = history.points.map((p) => ({
        time: new Date(p.timestamp).getTime(),
        heapAlloc: p.heapAlloc,
        heapSys: p.heapSys,
        sys: p.sys,
      }));
      const gcEvents: GCEvent[] = history.gcEvents.map((e) => ({
        time: new Date(e.timestamp).getTime(),
        pauseNs: e.pauseNs,
        gcNum: e.gcNum,
      }));

      mergeHistory(points, gcEvents);

      // Track latest timestamp for incremental polling
      if (history.points.length > 0) {
        lastTimestampRef.current = history.points[history.points.length - 1].timestamp;
      }
    } catch {
      // Silently ignore
    }
  }, [targetId, mergeHistory]);

  // Initial load: fetch full history
  useEffect(() => {
    if (!active) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      dataRef.current = [];
      gcEventsRef.current = [];
      lastTimestampRef.current = "";
      fetchHistory();
    }
  }, [active, fetchHistory]);

  // Incremental polling
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      fetchHistory(lastTimestampRef.current || undefined);
    }, 1000);
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

    const data = dataRef.current;
    if (data.length < 2) return;

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    const timeMin = data[0].time;
    const timeMax = data[data.length - 1].time;
    const timeRange = Math.max(timeMax - timeMin, 1000);

    let valueMax = 0;
    for (const p of data) {
      valueMax = Math.max(valueMax, p.sys, p.heapSys, p.heapAlloc);
    }
    valueMax = valueMax * 1.1;
    if (valueMax === 0) valueMax = 1;

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
      ctx.fillText(fmtBytes(v), pad.left - 8, y + 4);
    }

    // X axis
    ctx.textAlign = "center";
    const xTicks = Math.min(6, data.length);
    for (let i = 0; i < xTicks; i++) {
      const idx = Math.floor((i / (xTicks - 1)) * (data.length - 1));
      const p = data[idx];
      ctx.fillText(new Date(p.time).toLocaleTimeString(), xScale(p.time), h - 8);
    }

    // Lines
    const drawLine = (key: keyof DataPoint, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = xScale(data[i].time);
        const y = yScale(data[i][key] as number);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawLine("sys", COLORS.sys);
    drawLine("heapSys", COLORS.heapSys);
    drawLine("heapAlloc", COLORS.heapAlloc);

    // GC markers
    ctx.strokeStyle = COLORS.gc;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const gc of gcEventsRef.current) {
      if (gc.time >= timeMin && gc.time <= timeMax) {
        const x = xScale(gc.time);
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + chartH);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

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
  }, [latest, hoverInfo]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padLeft = 70, padRight = 16;
    const chartW = rect.width - padLeft - padRight;
    const data = dataRef.current;
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
        <LegendItem color={COLORS.heapAlloc} label="HeapAlloc" value={latest?.heapAlloc} />
        <LegendItem color={COLORS.heapSys} label="HeapSys" value={latest?.heapSys} />
        <LegendItem color={COLORS.sys} label="Sys" value={latest?.sys} />
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)" }}>
          <span style={{ width: 12, borderTop: `2px dashed ${COLORS.gc}`, display: "inline-block" }} />
          GC
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
            <div style={{ color: COLORS.heapAlloc }}>HeapAlloc: {fmtBytes(hoverInfo.point.heapAlloc)}</div>
            <div style={{ color: COLORS.heapSys }}>HeapSys: {fmtBytes(hoverInfo.point.heapSys)}</div>
            <div style={{ color: COLORS.sys }}>Sys: {fmtBytes(hoverInfo.point.sys)}</div>
          </div>
        )}
      </div>

      {gcStats.count > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 16 }}>
          <span>GC events: <strong style={{ color: COLORS.gc }}>{gcStats.count}</strong></span>
          <span>Avg pause: <strong>{gcStats.avgPauseMs.toFixed(2)}ms</strong></span>
          <span>Total pause: <strong>{gcStats.totalPauseMs.toFixed(2)}ms</strong></span>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value?: number }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 3, borderRadius: 1, background: color, display: "inline-block" }} />
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
        {value != null ? fmtBytes(value) : "\u2014"}
      </span>
    </span>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1 << 30) return (bytes / (1 << 30)).toFixed(1) + " GB";
  if (bytes >= 1 << 20) return (bytes / (1 << 20)).toFixed(1) + " MB";
  if (bytes >= 1 << 10) return (bytes / (1 << 10)).toFixed(1) + " KB";
  return bytes + " B";
}
