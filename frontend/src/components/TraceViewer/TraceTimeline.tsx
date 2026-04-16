import { useEffect, useRef, useState, useCallback } from "react";
import type { TraceData } from "../../api";

interface Props {
  data: TraceData;
  onSelectGoroutine?: (id: number) => void;
}

interface SpanDetail {
  goroutineId: number;
  goroutineName: string;
  state: string;
  startNs: number;
  endNs: number;
  reason?: string;
  stack?: string[];
}

const ROW_HEIGHT = 24;
const LABEL_WIDTH = 180;
const TIME_AXIS_HEIGHT = 28;
const MINIMAP_HEIGHT = 40;
const MINIMAP_PADDING = 6; // vertical padding inside minimap rows

const STATE_COLORS: Record<string, string> = {
  running:  "#22c55e",
  runnable: "#f59e0b",
  blocked:  "#ef4444",
  syscall:  "#8b5cf6",
  waiting:  "#6b7280",
};

function formatNs(ns: number): string {
  const abs = Math.abs(ns);
  if (abs < 1_000) return `${ns.toFixed(0)}ns`;
  if (abs < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
  if (abs < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`;
  return `${(ns / 1_000_000_000).toFixed(2)}s`;
}

function niceTickInterval(rangeNs: number, maxTicks: number): number {
  const raw = rangeNs / maxTicks;
  const magnitudes = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const scales = [1, 1_000, 1_000_000, 1_000_000_000];
  let best = raw;
  for (const scale of scales) {
    for (const mag of magnitudes) {
      const candidate = mag * scale;
      if (candidate >= raw) {
        if (candidate < best || best === raw) best = candidate;
        break;
      }
    }
  }
  return best;
}

export default function TraceTimeline({ data, onSelectGoroutine }: Props) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  // Compute total trace bounds
  const traceStartNs = 0;
  const traceEndNs = data.meta.durationNs || 1;

  const [viewStartNs, setViewStartNs] = useState(traceStartNs);
  const [viewEndNs, setViewEndNs] = useState(traceEndNs);
  const [scrollTop, setScrollTop] = useState(0);
  const [selectedSpan, setSelectedSpan] = useState<SpanDetail | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);

  // Stable refs so event handlers don't go stale
  const viewRef = useRef({ viewStartNs: traceStartNs, viewEndNs: traceEndNs, scrollTop: 0 });
  viewRef.current = { viewStartNs, viewEndNs, scrollTop };

  const dragRef = useRef<{ startX: number; startViewStart: number; startViewEnd: number } | null>(null);
  const minimapDragRef = useRef<{ startX: number } | null>(null);

  const goroutines = data.goroutines;
  const totalRows = goroutines.length;
  const totalContentHeight = totalRows * ROW_HEIGHT;

  // ─── Draw minimap ────────────────────────────────────────────────────────────
  const drawMinimap = useCallback(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#12121a";
    ctx.fillRect(0, 0, W, H);

    // Border bottom
    ctx.strokeStyle = "#2a2a3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 0.5);
    ctx.lineTo(W, H - 0.5);
    ctx.stroke();

    const timeRange = traceEndNs - traceStartNs || 1;
    const drawW = W - LABEL_WIDTH;

    // GC bands
    for (const gc of data.gcEvents) {
      const x0 = LABEL_WIDTH + ((gc.start - traceStartNs) / timeRange) * drawW;
      const x1 = LABEL_WIDTH + ((gc.end - traceStartNs) / timeRange) * drawW;
      ctx.fillStyle = "rgba(239,68,68,0.2)";
      ctx.fillRect(x0, 0, Math.max(x1 - x0, 1), H);
    }

    // Goroutine spans — one tiny row per goroutine, clipped to MINIMAP_PADDING
    const rowH = Math.max(1, (H - MINIMAP_PADDING * 2) / Math.max(goroutines.length, 1));
    for (let i = 0; i < goroutines.length; i++) {
      const g = goroutines[i];
      const y = MINIMAP_PADDING + i * rowH;
      for (const span of g.spans) {
        const x0 = LABEL_WIDTH + ((span.start - traceStartNs) / timeRange) * drawW;
        const x1 = LABEL_WIDTH + ((span.end - traceStartNs) / timeRange) * drawW;
        const w = Math.max(x1 - x0, 0.5);
        ctx.fillStyle = STATE_COLORS[span.state] ?? STATE_COLORS.waiting;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x0, y, w, Math.max(rowH - 0.5, 0.5));
      }
    }
    ctx.globalAlpha = 1;

    // Viewport rectangle
    const vx0 = LABEL_WIDTH + ((viewRef.current.viewStartNs - traceStartNs) / timeRange) * drawW;
    const vx1 = LABEL_WIDTH + ((viewRef.current.viewEndNs - traceStartNs) / timeRange) * drawW;
    ctx.fillStyle = "rgba(99,102,241,0.15)";
    ctx.fillRect(vx0, 0, Math.max(vx1 - vx0, 2), H);
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx0, 0.75, Math.max(vx1 - vx0, 2), H - 1.5);

    // Label area background
    ctx.fillStyle = "#12121a";
    ctx.fillRect(0, 0, LABEL_WIDTH, H);
    ctx.fillStyle = "#5a5a6e";
    ctx.font = `10px 'JetBrains Mono', monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Overview", 8, H / 2);
  }, [data, goroutines, traceEndNs, traceStartNs]);

  // ─── Draw main timeline ───────────────────────────────────────────────────
  const drawTimeline = useCallback(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const { viewStartNs: vsNs, viewEndNs: veNs, scrollTop: st } = viewRef.current;
    const viewRange = veNs - vsNs || 1;
    const drawW = W - LABEL_WIDTH;

    // Background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W, H);

    // Time axis background
    ctx.fillStyle = "#12121a";
    ctx.fillRect(0, 0, W, TIME_AXIS_HEIGHT);
    ctx.strokeStyle = "#2a2a3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, TIME_AXIS_HEIGHT - 0.5);
    ctx.lineTo(W, TIME_AXIS_HEIGHT - 0.5);
    ctx.stroke();

    // Time axis ticks
    const maxTicks = Math.floor(drawW / 80);
    const tickInterval = niceTickInterval(viewRange, maxTicks);
    const firstTick = Math.ceil(vsNs / tickInterval) * tickInterval;

    ctx.fillStyle = "#5a5a6e";
    ctx.font = `10px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let t = firstTick; t <= veNs; t += tickInterval) {
      const x = LABEL_WIDTH + ((t - vsNs) / viewRange) * drawW;
      ctx.strokeStyle = "#1f1f2e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, TIME_AXIS_HEIGHT);
      ctx.lineTo(x, H);
      ctx.stroke();

      ctx.strokeStyle = "#2a2a3a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, TIME_AXIS_HEIGHT - 6);
      ctx.lineTo(x, TIME_AXIS_HEIGHT);
      ctx.stroke();

      ctx.fillStyle = "#9898a8";
      ctx.fillText(formatNs(t), x, TIME_AXIS_HEIGHT / 2);
    }

    // GC bands (behind rows)
    for (const gc of data.gcEvents) {
      const x0 = LABEL_WIDTH + ((gc.start - vsNs) / viewRange) * drawW;
      const x1 = LABEL_WIDTH + ((gc.end - vsNs) / viewRange) * drawW;
      if (x1 < LABEL_WIDTH || x0 > W) continue;
      ctx.fillStyle = "rgba(239,68,68,0.15)";
      ctx.fillRect(Math.max(x0, LABEL_WIDTH), TIME_AXIS_HEIGHT, Math.min(x1, W) - Math.max(x0, LABEL_WIDTH), H - TIME_AXIS_HEIGHT);
    }

    // Visible goroutine rows
    const visibleAreaH = H - TIME_AXIS_HEIGHT;
    const firstRowIdx = Math.max(0, Math.floor(st / ROW_HEIGHT));
    const lastRowIdx = Math.min(totalRows - 1, Math.ceil((st + visibleAreaH) / ROW_HEIGHT));

    ctx.font = `11px 'Inter', system-ui, sans-serif`;

    for (let i = firstRowIdx; i <= lastRowIdx; i++) {
      const g = goroutines[i];
      const rowY = TIME_AXIS_HEIGHT + i * ROW_HEIGHT - st;

      // Row background (alternating)
      ctx.fillStyle = i % 2 === 0 ? "#0a0a0f" : "#0d0d14";
      ctx.fillRect(LABEL_WIDTH, rowY, drawW, ROW_HEIGHT);

      // Row separator
      ctx.strokeStyle = "#1a1a25";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH, rowY + ROW_HEIGHT - 0.5);
      ctx.lineTo(W, rowY + ROW_HEIGHT - 0.5);
      ctx.stroke();

      // Label area background
      ctx.fillStyle = "#0d0d14";
      ctx.fillRect(0, rowY, LABEL_WIDTH, ROW_HEIGHT);

      // Label text
      ctx.fillStyle = "#9898a8";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const label = `G${g.id}: ${g.name}`;
      // Clip label to label width
      ctx.save();
      ctx.beginPath();
      ctx.rect(4, rowY, LABEL_WIDTH - 8, ROW_HEIGHT);
      ctx.clip();
      ctx.fillText(label, 4, rowY + ROW_HEIGHT / 2);
      ctx.restore();

      // Spans
      const spanH = ROW_HEIGHT - 4;
      const spanY = rowY + 2;

      for (const span of g.spans) {
        // Skip completely out of view
        if (span.end < vsNs || span.start > veNs) continue;

        const x0 = LABEL_WIDTH + ((span.start - vsNs) / viewRange) * drawW;
        const x1 = LABEL_WIDTH + ((span.end - vsNs) / viewRange) * drawW;
        const clampedX0 = Math.max(x0, LABEL_WIDTH);
        const clampedX1 = Math.min(x1, W);
        const w = clampedX1 - clampedX0;
        if (w < 0.3) continue;

        ctx.fillStyle = STATE_COLORS[span.state] ?? STATE_COLORS.waiting;
        // Rounded rect for wider spans
        if (w >= 4) {
          const r = Math.min(2, w / 2, spanH / 2);
          ctx.beginPath();
          ctx.moveTo(clampedX0 + r, spanY);
          ctx.lineTo(clampedX1 - r, spanY);
          ctx.arcTo(clampedX1, spanY, clampedX1, spanY + r, r);
          ctx.lineTo(clampedX1, spanY + spanH - r);
          ctx.arcTo(clampedX1, spanY + spanH, clampedX1 - r, spanY + spanH, r);
          ctx.lineTo(clampedX0 + r, spanY + spanH);
          ctx.arcTo(clampedX0, spanY + spanH, clampedX0, spanY + spanH - r, r);
          ctx.lineTo(clampedX0, spanY + r);
          ctx.arcTo(clampedX0, spanY, clampedX0 + r, spanY, r);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(clampedX0, spanY, w, spanH);
        }
      }
    }

    // Label column right border
    ctx.strokeStyle = "#2a2a3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH - 0.5, TIME_AXIS_HEIGHT);
    ctx.lineTo(LABEL_WIDTH - 0.5, H);
    ctx.stroke();

    // Label column header
    ctx.fillStyle = "#12121a";
    ctx.fillRect(0, 0, LABEL_WIDTH, TIME_AXIS_HEIGHT);
    ctx.fillStyle = "#5a5a6e";
    ctx.font = `10px 'JetBrains Mono', monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("GOROUTINE", 8, TIME_AXIS_HEIGHT / 2);
  }, [data, goroutines, totalRows]);

  // ─── Redraw on state changes ──────────────────────────────────────────────
  useEffect(() => {
    drawTimeline();
    drawMinimap();
  }, [viewStartNs, viewEndNs, scrollTop, drawTimeline, drawMinimap]);

  // ─── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const mainCanvas = mainCanvasRef.current;
    const minimapCanvas = minimapCanvasRef.current;
    if (!mainCanvas || !minimapCanvas) return;

    const ro = new ResizeObserver(() => {
      drawTimeline();
      drawMinimap();
    });
    ro.observe(mainCanvas);
    ro.observe(minimapCanvas);
    return () => ro.disconnect();
  }, [drawTimeline, drawMinimap]);

  // ─── Wheel zoom ───────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { viewStartNs: vsNs, viewEndNs: veNs } = viewRef.current;
    const viewRange = veNs - vsNs;

    // Pan with horizontal scroll or shift+wheel
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const delta = (e.deltaX || e.deltaY) / rect.width;
      const panAmt = delta * viewRange;
      const newStart = Math.max(traceStartNs, Math.min(vsNs + panAmt, traceEndNs - viewRange));
      const newEnd = newStart + viewRange;
      setViewStartNs(newStart);
      setViewEndNs(newEnd);
      return;
    }

    // Vertical scroll within the canvas body
    if (!e.ctrlKey && !e.metaKey) {
      // Scroll goroutine rows
      const delta = e.deltaY;
      setScrollTop((prev) => {
        const canvas = mainCanvasRef.current;
        const viewportH = canvas ? canvas.getBoundingClientRect().height - TIME_AXIS_HEIGHT : 400;
        const maxScroll = Math.max(0, totalContentHeight - viewportH);
        return Math.max(0, Math.min(prev + delta, maxScroll));
      });
      return;
    }

    // Zoom centered on cursor
    const cursorX = e.clientX - rect.left;
    const drawW = rect.width - LABEL_WIDTH;
    const cursorFrac = Math.max(0, Math.min(1, (cursorX - LABEL_WIDTH) / drawW));
    const cursorNs = vsNs + cursorFrac * viewRange;

    const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    let newRange = viewRange * zoomFactor;
    newRange = Math.max(1_000, Math.min(newRange, traceEndNs - traceStartNs));

    let newStart = cursorNs - cursorFrac * newRange;
    let newEnd = newStart + newRange;

    if (newStart < traceStartNs) { newStart = traceStartNs; newEnd = newStart + newRange; }
    if (newEnd > traceEndNs) { newEnd = traceEndNs; newStart = newEnd - newRange; }

    setViewStartNs(newStart);
    setViewEndNs(newEnd);
  }, [totalContentHeight, traceEndNs, traceStartNs]);

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ─── Mouse drag (pan) ─────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { viewStartNs: vsNs, viewEndNs: veNs } = viewRef.current;
    dragRef.current = { startX: e.clientX, startViewStart: vsNs, startViewEnd: veNs };
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragRef.current) return;
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = rect.width - LABEL_WIDTH;
    if (drawW <= 0) return;

    const dx = e.clientX - dragRef.current.startX;
    const { startViewStart, startViewEnd } = dragRef.current;
    const viewRange = startViewEnd - startViewStart;
    const panAmt = -(dx / drawW) * viewRange;

    let newStart = Math.max(traceStartNs, Math.min(startViewStart + panAmt, traceEndNs - viewRange));
    let newEnd = newStart + viewRange;

    setViewStartNs(newStart);
    setViewEndNs(newEnd);
  }, [isDragging, traceEndNs, traceStartNs]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = Math.abs(e.clientX - (dragRef.current?.startX ?? e.clientX));
    setIsDragging(false);

    // If barely moved, treat as a click to select a span
    if (dx < 4) {
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { viewStartNs: vsNs, viewEndNs: veNs, scrollTop: st } = viewRef.current;
      const viewRange = veNs - vsNs;
      const drawW = rect.width - LABEL_WIDTH;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (mouseX < LABEL_WIDTH || mouseY < TIME_AXIS_HEIGHT) return;

      const clickNs = vsNs + ((mouseX - LABEL_WIDTH) / drawW) * viewRange;
      const rowIdx = Math.floor((mouseY - TIME_AXIS_HEIGHT + st) / ROW_HEIGHT);
      if (rowIdx < 0 || rowIdx >= goroutines.length) return;

      const g = goroutines[rowIdx];
      // Find clicked span
      let hit: SpanDetail | null = null;
      for (const span of g.spans) {
        if (clickNs >= span.start && clickNs <= span.end) {
          hit = {
            goroutineId: g.id,
            goroutineName: g.name,
            state: span.state,
            startNs: span.start,
            endNs: span.end,
            reason: span.reason,
            stack: span.stack,
          };
          break;
        }
      }
      setSelectedSpan(hit);
      if (hit) onSelectGoroutine?.(g.id);
    }
    dragRef.current = null;
  }, [isDragging, goroutines, onSelectGoroutine]);

  // ─── Minimap interactions ─────────────────────────────────────────────────
  const handleMinimapMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    minimapDragRef.current = { startX: e.clientX };
    setIsMinimapDragging(true);

    // Jump viewport to click position
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = rect.width - LABEL_WIDTH;
    const mouseX = e.clientX - rect.left - LABEL_WIDTH;
    const frac = Math.max(0, Math.min(1, mouseX / drawW));
    const timeRange = traceEndNs - traceStartNs;
    const { viewStartNs: vsNs, viewEndNs: veNs } = viewRef.current;
    const currentRange = veNs - vsNs;
    const centerNs = traceStartNs + frac * timeRange;
    let newStart = centerNs - currentRange / 2;
    let newEnd = newStart + currentRange;
    if (newStart < traceStartNs) { newStart = traceStartNs; newEnd = newStart + currentRange; }
    if (newEnd > traceEndNs) { newEnd = traceEndNs; newStart = newEnd - currentRange; }
    setViewStartNs(newStart);
    setViewEndNs(newEnd);
  }, [traceEndNs, traceStartNs]);

  const handleMinimapMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMinimapDragging) return;
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const drawW = rect.width - LABEL_WIDTH;
    if (drawW <= 0) return;

    const mouseX = e.clientX - rect.left - LABEL_WIDTH;
    const frac = Math.max(0, Math.min(1, mouseX / drawW));
    const timeRange = traceEndNs - traceStartNs;
    const { viewStartNs: vsNs, viewEndNs: veNs } = viewRef.current;
    const currentRange = veNs - vsNs;
    const centerNs = traceStartNs + frac * timeRange;
    let newStart = centerNs - currentRange / 2;
    let newEnd = newStart + currentRange;
    if (newStart < traceStartNs) { newStart = traceStartNs; newEnd = newStart + currentRange; }
    if (newEnd > traceEndNs) { newEnd = traceEndNs; newStart = newEnd - currentRange; }
    setViewStartNs(newStart);
    setViewEndNs(newEnd);
  }, [isMinimapDragging, traceEndNs, traceStartNs]);

  const handleMinimapMouseUp = useCallback(() => {
    setIsMinimapDragging(false);
    minimapDragRef.current = null;
  }, []);

  // ─── Global mouseup for drag release outside canvas ───────────────────────
  useEffect(() => {
    const up = () => {
      setIsDragging(false);
      setIsMinimapDragging(false);
      dragRef.current = null;
      minimapDragRef.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // ─── Reset zoom ───────────────────────────────────────────────────────────
  const resetZoom = () => {
    setViewStartNs(traceStartNs);
    setViewEndNs(traceEndNs);
    setScrollTop(0);
  };

  const zoomIn = () => {
    const { viewStartNs: vsNs, viewEndNs: veNs } = viewRef.current;
    const range = veNs - vsNs;
    const center = (vsNs + veNs) / 2;
    const newRange = Math.max(1_000, range / 2);
    setViewStartNs(center - newRange / 2);
    setViewEndNs(center + newRange / 2);
  };

  const zoomOut = () => {
    const { viewStartNs: vsNs, viewEndNs: veNs } = viewRef.current;
    const range = veNs - vsNs;
    const center = (vsNs + veNs) / 2;
    const newRange = Math.min(traceEndNs - traceStartNs, range * 2);
    let newStart = center - newRange / 2;
    let newEnd = newStart + newRange;
    if (newStart < traceStartNs) { newStart = traceStartNs; newEnd = newStart + newRange; }
    if (newEnd > traceEndNs) { newEnd = traceEndNs; newStart = newEnd - newRange; }
    setViewStartNs(newStart);
    setViewEndNs(newEnd);
  };

  const viewRange = viewEndNs - viewStartNs;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 0 8px",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}>
        <button className="btn btn-secondary btn-sm" onClick={zoomIn}>Zoom In</button>
        <button className="btn btn-secondary btn-sm" onClick={zoomOut}>Zoom Out</button>
        <button className="btn btn-secondary btn-sm" onClick={resetZoom}>Reset</button>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
          View: {formatNs(viewStartNs)} – {formatNs(viewEndNs)}
          &nbsp;&nbsp;Range: {formatNs(viewRange)}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
          Scroll to zoom · Drag to pan · Ctrl+scroll to zoom
        </span>
        {/* Legend */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11, color: "var(--text-secondary)" }}>
          {Object.entries(STATE_COLORS).map(([state, color]) => (
            <span key={state} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
              {state}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(239,68,68,0.35)", border: "1px solid #ef4444", display: "inline-block" }} />
            GC
          </span>
        </div>
      </div>

      {/* Minimap */}
      <canvas
        ref={minimapCanvasRef}
        style={{
          width: "100%",
          height: MINIMAP_HEIGHT,
          display: "block",
          cursor: isMinimapDragging ? "grabbing" : "pointer",
          flexShrink: 0,
        }}
        onMouseDown={handleMinimapMouseDown}
        onMouseMove={handleMinimapMouseMove}
        onMouseUp={handleMinimapMouseUp}
        onMouseLeave={handleMinimapMouseUp}
      />

      {/* Main canvas */}
      <canvas
        ref={mainCanvasRef}
        style={{
          width: "100%",
          flex: 1,
          display: "block",
          cursor: isDragging ? "grabbing" : "default",
          minHeight: 300,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { if (isDragging) { setIsDragging(false); dragRef.current = null; } }}
      />

      {/* Span detail panel */}
      {selectedSpan && (
        <div style={{
          borderTop: "1px solid var(--border)",
          background: "var(--bg-surface)",
          padding: "12px 16px",
          flexShrink: 0,
          maxHeight: 220,
          overflowY: "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
              G{selectedSpan.goroutineId}: {selectedSpan.goroutineName}
            </span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: `${STATE_COLORS[selectedSpan.state] ?? STATE_COLORS.waiting}22`,
              color: STATE_COLORS[selectedSpan.state] ?? STATE_COLORS.waiting,
            }}>
              {selectedSpan.state}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {formatNs(selectedSpan.endNs - selectedSpan.startNs)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {formatNs(selectedSpan.startNs)} – {formatNs(selectedSpan.endNs)}
            </span>
            {selectedSpan.reason && (
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Reason: <span className="mono" style={{ color: "var(--text-primary)" }}>{selectedSpan.reason}</span>
              </span>
            )}
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setSelectedSpan(null)}
            >
              ✕
            </button>
          </div>
          {selectedSpan.stack && selectedSpan.stack.length > 0 && (
            <div style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              lineHeight: 1.6,
              color: "var(--text-secondary)",
            }}>
              {selectedSpan.stack.map((frame, i) => (
                <div key={i} style={{ color: i === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {frame}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
