import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api";

interface DataPoint {
  time: number;
  heapUsed: number;
  heapCommitted: number;
  heapMax: number;
  threadCount: number;
  threadPeak: number;
  gcCount: number;
  gcTimeMs: number;
}

const MAX_POINTS = 7200;

function fmtBytes(bytes: number): string {
  if (bytes >= 1 << 30) return (bytes / (1 << 30)).toFixed(1) + " GB";
  if (bytes >= 1 << 20) return (bytes / (1 << 20)).toFixed(1) + " MB";
  if (bytes >= 1 << 10) return (bytes / (1 << 10)).toFixed(1) + " KB";
  return bytes + " B";
}

function drawChart(
  canvas: HTMLCanvasElement,
  data: DataPoint[],
  windowMs: number,
  lines: { key: keyof DataPoint; color: string; label: string }[],
  formatY: (v: number) => string,
) {
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

  const cutoff = Date.now() - windowMs;
  const filtered = data.filter((d) => d.time >= cutoff);
  if (filtered.length < 2) return;

  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, w, h);

  const timeMin = filtered[0].time;
  const timeMax = filtered[filtered.length - 1].time;
  const timeRange = Math.max(timeMax - timeMin, 1000);

  let valueMax = 0;
  for (const p of filtered) {
    for (const line of lines) {
      valueMax = Math.max(valueMax, p[line.key] as number);
    }
  }
  valueMax = Math.max(valueMax * 1.1, 1);

  const xScale = (t: number) => pad.left + ((t - timeMin) / timeRange) * chartW;
  const yScale = (v: number) => pad.top + chartH - (v / valueMax) * chartH;

  // Grid
  ctx.strokeStyle = "#1f1f2e";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#5a5a6e";
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  for (let i = 0; i <= 5; i++) {
    const v = (valueMax / 5) * i;
    const y = yScale(v);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(formatY(v), pad.left - 8, y + 4);
  }

  // X axis
  ctx.textAlign = "center";
  const xTicks = Math.min(6, filtered.length);
  for (let i = 0; i < xTicks; i++) {
    const idx = Math.floor((i / (xTicks - 1)) * (filtered.length - 1));
    ctx.fillText(new Date(filtered[idx].time).toLocaleTimeString(), xScale(filtered[idx].time), h - 8);
  }

  // Lines
  for (const line of lines) {
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < filtered.length; i++) {
      const x = xScale(filtered[i].time);
      const y = yScale(filtered[i][line.key] as number);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export default function JavaMonitorCharts({ targetId, active, windowMs = 300000 }: { targetId: string; active: boolean; windowMs?: number }) {
  const dataRef = useRef<DataPoint[]>([]);
  const lastTimestampRef = useRef<string>("");
  const [latest, setLatest] = useState<DataPoint | null>(null);
  const initializedRef = useRef(false);
  const heapCanvasRef = useRef<HTMLCanvasElement>(null);
  const threadCanvasRef = useRef<HTMLCanvasElement>(null);

  const mergeHistory = useCallback((points: DataPoint[]) => {
    if (points.length > 0) {
      dataRef.current = [...dataRef.current, ...points].slice(-MAX_POINTS);
      setLatest(dataRef.current[dataRef.current.length - 1]);
    }
  }, []);

  const fetchHistory = useCallback(async (since?: string) => {
    try {
      const history = await api.getJavaMonitorHistory(targetId, since);
      const points: DataPoint[] = history.points.map((p) => ({
        time: new Date(p.timestamp).getTime(),
        heapUsed: p.heapUsed,
        heapCommitted: p.heapCommitted,
        heapMax: p.heapMax,
        threadCount: p.threadCount,
        threadPeak: p.threadPeak,
        gcCount: p.gcCount,
        gcTimeMs: p.gcTimeMs,
      }));
      mergeHistory(points);
      if (history.points.length > 0) {
        lastTimestampRef.current = history.points[history.points.length - 1].timestamp;
      }
    } catch { /* ignore */ }
  }, [targetId, mergeHistory]);

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

  // Draw charts
  useEffect(() => {
    if (!latest) return;
    if (heapCanvasRef.current) {
      drawChart(heapCanvasRef.current, dataRef.current, windowMs, [
        { key: "heapUsed", color: "#22c55e", label: "Used" },
        { key: "heapCommitted", color: "#6366f1", label: "Committed" },
        { key: "heapMax", color: "#6b7280", label: "Max" },
      ], fmtBytes);
    }
    if (threadCanvasRef.current) {
      drawChart(threadCanvasRef.current, dataRef.current, windowMs, [
        { key: "threadCount", color: "#f59e0b", label: "Threads" },
        { key: "threadPeak", color: "#6b7280", label: "Peak" },
      ], (v) => Math.round(v).toString());
    }
  }, [latest, windowMs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>JVM Heap</h2>
        <div style={{ display: "flex", gap: 20, marginBottom: 8, fontSize: 13 }}>
          <LegendItem color="#22c55e" label="Used" value={latest?.heapUsed} fmt={fmtBytes} />
          <LegendItem color="#6366f1" label="Committed" value={latest?.heapCommitted} fmt={fmtBytes} />
          <LegendItem color="#6b7280" label="Max" value={latest?.heapMax} fmt={fmtBytes} />
        </div>
        <div className="card" style={{ padding: 0 }}>
          <canvas ref={heapCanvasRef} style={{ width: "100%", height: 240, display: "block" }} />
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Threads</h2>
        <div style={{ display: "flex", gap: 20, marginBottom: 8, fontSize: 13 }}>
          <LegendItem color="#f59e0b" label="Count" value={latest?.threadCount} fmt={(v) => Math.round(v).toString()} />
          <LegendItem color="#6b7280" label="Peak" value={latest?.threadPeak} fmt={(v) => Math.round(v).toString()} />
        </div>
        <div className="card" style={{ padding: 0 }}>
          <canvas ref={threadCanvasRef} style={{ width: "100%", height: 200, display: "block" }} />
        </div>
      </div>

      {latest && (latest.gcCount > 0 || latest.gcTimeMs > 0) && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>GC</h2>
          <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
            <span>Collections: <strong style={{ color: "var(--text-primary)" }}>{latest.gcCount}</strong></span>
            <span>Total time: <strong style={{ color: "var(--text-primary)" }}>{latest.gcTimeMs}ms</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, value, fmt }: { color: string; label: string; value?: number; fmt: (v: number) => string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 3, borderRadius: 1, background: color, display: "inline-block" }} />
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
        {value != null ? fmt(value) : "\u2014"}
      </span>
    </span>
  );
}
