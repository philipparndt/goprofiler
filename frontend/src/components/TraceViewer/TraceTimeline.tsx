import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { TraceData } from "../../api";

interface Props {
  data: TraceData;
  onSelectGoroutine?: (id: number) => void;
  onAiAnalyze?: (mode: string, extra?: Record<string, any>) => void;
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

interface CompactSegment {
  realStart: number; // nanoseconds
  realEnd: number;   // nanoseconds
  pxStart: number;   // pixel offset from labelWidth
  pxEnd: number;     // pixel offset
}

interface CompactBreak {
  realStart: number;
  realEnd: number;
  pxStart: number;
  pxWidth: number;   // always BREAK_WIDTH (40px)
  durationLabel: string;
}

const ROW_HEIGHT = 24;
const DEFAULT_LABEL_WIDTH = 180;
const TIME_AXIS_HEIGHT = 28;
const MINIMAP_HEIGHT = 40;
const MINIMAP_PADDING = 6; // vertical padding inside minimap rows
const BREAK_WIDTH = 40;    // pixels for compact break zones

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

/**
 * Convert a nanosecond time value to a pixel position.
 * When segments/breaks are provided (compact mode), uses piecewise mapping.
 * Falls back to linear mapping otherwise.
 */
function nsToPixel(
  ns: number,
  segments: CompactSegment[] | null,
  breaks: CompactBreak[] | null,
  labelW: number,
  drawW: number,
  viewStartNs: number,
  viewEndNs: number,
): number {
  if (!segments || !breaks) {
    const viewRange = viewEndNs - viewStartNs || 1;
    return labelW + ((ns - viewStartNs) / viewRange) * drawW;
  }

  // Check if ns falls within a break zone
  for (const brk of breaks) {
    if (ns >= brk.realStart && ns <= brk.realEnd) {
      // Map to center of break pixel range
      return brk.pxStart + labelW + brk.pxWidth / 2;
    }
  }

  // Find the segment that contains ns
  for (const seg of segments) {
    if (ns >= seg.realStart && ns <= seg.realEnd) {
      const segRange = seg.realEnd - seg.realStart || 1;
      const frac = (ns - seg.realStart) / segRange;
      return labelW + seg.pxStart + frac * (seg.pxEnd - seg.pxStart);
    }
  }

  // Outside all segments: clamp to nearest edge
  if (segments.length === 0) {
    const viewRange = viewEndNs - viewStartNs || 1;
    return labelW + ((ns - viewStartNs) / viewRange) * drawW;
  }
  if (ns < segments[0].realStart) {
    return labelW + segments[0].pxStart;
  }
  const last = segments[segments.length - 1];
  return labelW + last.pxEnd;
}

/**
 * Convert a pixel position to nanoseconds (inverse of nsToPixel).
 * When segments/breaks are provided (compact mode), uses piecewise inverse.
 * Falls back to linear inverse otherwise.
 */
function pixelToNs(
  px: number,
  segments: CompactSegment[] | null,
  breaks: CompactBreak[] | null,
  labelW: number,
  drawW: number,
  viewStartNs: number,
  viewEndNs: number,
): number {
  if (!segments || !breaks) {
    const viewRange = viewEndNs - viewStartNs || 1;
    return viewStartNs + ((px - labelW) / drawW) * viewRange;
  }

  const relPx = px - labelW;

  // Check if px falls in a break zone
  for (const brk of breaks) {
    if (relPx >= brk.pxStart && relPx <= brk.pxStart + brk.pxWidth) {
      // Map to center of break real range
      return (brk.realStart + brk.realEnd) / 2;
    }
  }

  // Find the segment that contains relPx
  for (const seg of segments) {
    if (relPx >= seg.pxStart && relPx <= seg.pxEnd) {
      const pxRange = seg.pxEnd - seg.pxStart || 1;
      const frac = (relPx - seg.pxStart) / pxRange;
      return seg.realStart + frac * (seg.realEnd - seg.realStart);
    }
  }

  // Outside all segments: clamp
  if (segments.length === 0) {
    const viewRange = viewEndNs - viewStartNs || 1;
    return viewStartNs + ((px - labelW) / drawW) * viewRange;
  }
  if (relPx < segments[0].pxStart) {
    return segments[0].realStart;
  }
  return segments[segments.length - 1].realEnd;
}

/**
 * Build compact segments and breaks from a list of merged active intervals.
 * drawWidth is the available pixel width for the draw area (canvas width - labelWidth).
 */
function buildCompactLayout(
  mergedIntervals: Array<[number, number]>,
  gaps: Array<[number, number]>,
  drawWidth: number,
): { segments: CompactSegment[]; breaks: CompactBreak[] } {
  if (mergedIntervals.length === 0) {
    return { segments: [], breaks: [] };
  }

  // Total real time covered by active segments
  const totalRealNs = mergedIntervals.reduce((sum, [s, e]) => sum + (e - s), 0);
  // Total pixels used by breaks
  const totalBreakPx = gaps.length * BREAK_WIDTH;
  // Remaining pixels for actual content
  const contentPx = Math.max(1, drawWidth - totalBreakPx);

  const segments: CompactSegment[] = [];
  const breaks: CompactBreak[] = [];

  let cursor = 0; // current pixel offset (relative, from 0, not from labelW)

  for (let i = 0; i < mergedIntervals.length; i++) {
    const [realStart, realEnd] = mergedIntervals[i];
    const realDuration = realEnd - realStart;
    // Proportional pixel width for this segment
    const segPx = totalRealNs > 0 ? (realDuration / totalRealNs) * contentPx : contentPx;

    segments.push({
      realStart,
      realEnd,
      pxStart: cursor,
      pxEnd: cursor + segPx,
    });
    cursor += segPx;

    // If there's a gap after this segment, insert a break
    if (i < gaps.length) {
      const [gapStart, gapEnd] = gaps[i];
      breaks.push({
        realStart: gapStart,
        realEnd: gapEnd,
        pxStart: cursor,
        pxWidth: BREAK_WIDTH,
        durationLabel: formatNs(gapEnd - gapStart),
      });
      cursor += BREAK_WIDTH;
    }
  }

  return { segments, breaks };
}

export default function TraceTimeline({ data, onSelectGoroutine, onAiAnalyze }: Props) {
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
  const [labelWidth, setLabelWidth] = useState(DEFAULT_LABEL_WIDTH);
  const [isResizingLabel, setIsResizingLabel] = useState(false);
  const labelWidthRef = useRef(DEFAULT_LABEL_WIDTH);
  const [hiddenStates, setHiddenStates] = useState<Set<string>>(new Set());
  const hiddenStatesRef = useRef<Set<string>>(new Set());
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);

  // Stable refs so event handlers don't go stale
  const viewRef = useRef({ viewStartNs: traceStartNs, viewEndNs: traceEndNs, scrollTop: 0 });
  viewRef.current = { viewStartNs, viewEndNs, scrollTop };

  const dragRef = useRef<{ startX: number; startViewStart: number; startViewEnd: number } | null>(null);
  const minimapDragRef = useRef<{ startX: number } | null>(null);

  // Filter goroutines: only show those with at least one visible span
  const goroutines = useMemo(() =>
    data.goroutines.filter((g) =>
      g.spans.some((s) => !hiddenStates.has(s.state))
    ),
    [data.goroutines, hiddenStates]
  );
  const totalRows = goroutines.length;
  const totalContentHeight = totalRows * ROW_HEIGHT;

  // ─── Compact segment computation ─────────────────────────────────────────
  const compactLayout = useMemo((): { segments: CompactSegment[]; breaks: CompactBreak[] } | null => {
    if (!compact) return null;

    // Collect all visible span intervals
    const intervals: Array<[number, number]> = [];
    for (const g of goroutines) {
      for (const span of g.spans) {
        if (hiddenStates.has(span.state)) continue;
        intervals.push([span.start, span.end]);
      }
    }

    if (intervals.length === 0) return null;

    // Sort by start
    intervals.sort((a, b) => a[0] - b[0]);

    // Merge overlapping / adjacent intervals
    const merged: Array<[number, number]> = [];
    let [curStart, curEnd] = intervals[0];
    for (let i = 1; i < intervals.length; i++) {
      const [s, e] = intervals[i];
      if (s <= curEnd) {
        curEnd = Math.max(curEnd, e);
      } else {
        merged.push([curStart, curEnd]);
        curStart = s;
        curEnd = e;
      }
    }
    merged.push([curStart, curEnd]);

    // Gap threshold: max(1ms, 2% of total trace duration)
    const gapThreshold = Math.max(1_000_000, (traceEndNs - traceStartNs) * 0.02);

    // Find significant gaps between merged intervals
    const gaps: Array<[number, number]> = [];
    const activeIntervals: Array<[number, number]> = [];

    for (let i = 0; i < merged.length; i++) {
      if (i === 0) {
        activeIntervals.push(merged[i]);
      } else {
        const gapStart = merged[i - 1][1];
        const gapEnd = merged[i][0];
        if (gapEnd - gapStart > gapThreshold) {
          gaps.push([gapStart, gapEnd]);
          activeIntervals.push(merged[i]);
        } else {
          // Merge small gap into previous segment
          activeIntervals[activeIntervals.length - 1] = [
            activeIntervals[activeIntervals.length - 1][0],
            merged[i][1],
          ];
        }
      }
    }

    // Get current draw width from canvas (use ref so this is stable)
    const canvas = mainCanvasRef.current;
    const drawWidth = canvas
      ? canvas.getBoundingClientRect().width - labelWidthRef.current
      : 800 - labelWidthRef.current;

    return buildCompactLayout(activeIntervals, gaps, drawWidth);
  }, [compact, goroutines, hiddenStates, traceEndNs, traceStartNs]);

  // Keep a ref so canvas draw callbacks can access without stale closures
  const compactLayoutRef = useRef(compactLayout);
  compactLayoutRef.current = compactLayout;
  compactRef.current = compact;

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
    const drawW = W - labelWidthRef.current;

    // GC bands
    for (const gc of data.gcEvents) {
      const x0 = labelWidthRef.current + ((gc.start - traceStartNs) / timeRange) * drawW;
      const x1 = labelWidthRef.current + ((gc.end - traceStartNs) / timeRange) * drawW;
      ctx.fillStyle = "rgba(239,68,68,0.2)";
      ctx.fillRect(x0, 0, Math.max(x1 - x0, 1), H);
    }

    // Goroutine spans — one tiny row per goroutine, clipped to MINIMAP_PADDING
    const rowH = Math.max(1, (H - MINIMAP_PADDING * 2) / Math.max(goroutines.length, 1));
    for (let i = 0; i < goroutines.length; i++) {
      const g = goroutines[i];
      const y = MINIMAP_PADDING + i * rowH;
      for (const span of g.spans) {
        if (hiddenStatesRef.current.has(span.state)) continue;
        const x0 = labelWidthRef.current + ((span.start - traceStartNs) / timeRange) * drawW;
        const x1 = labelWidthRef.current + ((span.end - traceStartNs) / timeRange) * drawW;
        const w = Math.max(x1 - x0, 0.5);
        ctx.fillStyle = STATE_COLORS[span.state] ?? STATE_COLORS.waiting;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x0, y, w, Math.max(rowH - 0.5, 0.5));
      }
    }
    ctx.globalAlpha = 1;

    // Viewport rectangle
    const vx0 = labelWidthRef.current + ((viewRef.current.viewStartNs - traceStartNs) / timeRange) * drawW;
    const vx1 = labelWidthRef.current + ((viewRef.current.viewEndNs - traceStartNs) / timeRange) * drawW;
    ctx.fillStyle = "rgba(99,102,241,0.15)";
    ctx.fillRect(vx0, 0, Math.max(vx1 - vx0, 2), H);
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx0, 0.75, Math.max(vx1 - vx0, 2), H - 1.5);

    // Label area background
    ctx.fillStyle = "#12121a";
    ctx.fillRect(0, 0, labelWidthRef.current, H);
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
    const drawW = W - labelWidthRef.current;

    const layout = compactLayoutRef.current;
    const segments = layout?.segments ?? null;
    const breaks = layout?.breaks ?? null;

    // Helper: ns -> pixel (accounts for compact layout)
    const toX = (ns: number) =>
      nsToPixel(ns, segments, breaks, labelWidthRef.current, drawW, vsNs, veNs);

    // Background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W, H);

    // Time axis background
    ctx.fillStyle = "#12121a";
    ctx.fillRect(0, 0, W, TIME_AXIS_HEIGHT);
    ctx.strokeStyle = "#2a2a3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(labelWidthRef.current, TIME_AXIS_HEIGHT - 0.5);
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
      const x = toX(t);
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
      const x0 = toX(gc.start);
      const x1 = toX(gc.end);
      if (x1 < labelWidthRef.current || x0 > W) continue;
      ctx.fillStyle = "rgba(239,68,68,0.15)";
      ctx.fillRect(
        Math.max(x0, labelWidthRef.current),
        TIME_AXIS_HEIGHT,
        Math.min(x1, W) - Math.max(x0, labelWidthRef.current),
        H - TIME_AXIS_HEIGHT,
      );
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
      ctx.fillRect(labelWidthRef.current, rowY, drawW, ROW_HEIGHT);

      // Row separator
      ctx.strokeStyle = "#1a1a25";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(labelWidthRef.current, rowY + ROW_HEIGHT - 0.5);
      ctx.lineTo(W, rowY + ROW_HEIGHT - 0.5);
      ctx.stroke();

      // Label area background
      ctx.fillStyle = "#0d0d14";
      ctx.fillRect(0, rowY, labelWidthRef.current, ROW_HEIGHT);

      // Label text
      ctx.fillStyle = "#9898a8";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const label = `G${g.id}: ${g.name}`;
      // Clip label to label width
      ctx.save();
      ctx.beginPath();
      ctx.rect(4, rowY, labelWidthRef.current - 8, ROW_HEIGHT);
      ctx.clip();
      ctx.fillText(label, 4, rowY + ROW_HEIGHT / 2);
      ctx.restore();

      // Spans
      const spanH = ROW_HEIGHT - 4;
      const spanY = rowY + 2;

      for (const span of g.spans) {
        // Skip hidden states or completely out of view
        if (hiddenStatesRef.current.has(span.state)) continue;
        if (span.end < vsNs || span.start > veNs) continue;

        const x0 = toX(span.start);
        const x1 = toX(span.end);
        const clampedX0 = Math.max(x0, labelWidthRef.current);
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

    // ─── Draw compact break zones ────────────────────────────────────────────
    if (breaks && breaks.length > 0) {
      for (const brk of breaks) {
        const bx = labelWidthRef.current + brk.pxStart;
        const bw = brk.pxWidth;

        // Only draw if visible
        if (bx + bw < labelWidthRef.current || bx > W) continue;

        // Dark background for break zone
        ctx.fillStyle = "rgba(10,10,15,0.85)";
        ctx.fillRect(bx, TIME_AXIS_HEIGHT, bw, H - TIME_AXIS_HEIGHT);

        // Diagonal hatching at 45°
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, TIME_AXIS_HEIGHT, bw, H - TIME_AXIS_HEIGHT);
        ctx.clip();
        ctx.strokeStyle = "rgba(90,90,110,0.35)";
        ctx.lineWidth = 1;
        const step = 8;
        const totalH = H - TIME_AXIS_HEIGHT;
        for (let d = -totalH; d < bw + totalH; d += step) {
          ctx.beginPath();
          ctx.moveTo(bx + d, TIME_AXIS_HEIGHT);
          ctx.lineTo(bx + d + totalH, TIME_AXIS_HEIGHT + totalH);
          ctx.stroke();
        }
        ctx.restore();

        // Left and right border lines
        ctx.strokeStyle = "rgba(90,90,110,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + 0.5, TIME_AXIS_HEIGHT);
        ctx.lineTo(bx + 0.5, H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + bw - 0.5, TIME_AXIS_HEIGHT);
        ctx.lineTo(bx + bw - 0.5, H);
        ctx.stroke();

        // Duration label centered in break zone (time axis row)
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, 0, bw, TIME_AXIS_HEIGHT);
        ctx.clip();
        ctx.fillStyle = "#6b6b7e";
        ctx.font = `9px 'JetBrains Mono', monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(brk.durationLabel, bx + bw / 2, TIME_AXIS_HEIGHT / 2);
        ctx.restore();
      }
    }

    // Label column right border
    ctx.strokeStyle = "#2a2a3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(labelWidthRef.current - 0.5, TIME_AXIS_HEIGHT);
    ctx.lineTo(labelWidthRef.current - 0.5, H);
    ctx.stroke();

    // Label column header
    ctx.fillStyle = "#12121a";
    ctx.fillRect(0, 0, labelWidthRef.current, TIME_AXIS_HEIGHT);
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
  }, [viewStartNs, viewEndNs, scrollTop, labelWidth, hiddenStates, compact, compactLayout, drawTimeline, drawMinimap]);

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
    const drawW = rect.width - labelWidthRef.current;
    const layout = compactLayoutRef.current;
    const segments = layout?.segments ?? null;
    const breakZones = layout?.breaks ?? null;

    // Convert cursor pixel to ns using the current mapping
    const cursorNs = pixelToNs(cursorX, segments, breakZones, labelWidthRef.current, drawW, vsNs, veNs);
    const cursorFrac = Math.max(0, Math.min(1, (cursorX - labelWidthRef.current) / drawW));

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
    const drawW = rect.width - labelWidthRef.current;
    if (drawW <= 0) return;

    const dx = e.clientX - dragRef.current.startX;
    const { startViewStart, startViewEnd } = dragRef.current;
    const viewRange = startViewEnd - startViewStart;
    const panAmt = -(dx / drawW) * viewRange;

    const newStart = Math.max(traceStartNs, Math.min(startViewStart + panAmt, traceEndNs - viewRange));
    const newEnd = newStart + viewRange;

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
      const drawW = rect.width - labelWidthRef.current;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (mouseX < labelWidthRef.current || mouseY < TIME_AXIS_HEIGHT) return;

      const layout = compactLayoutRef.current;
      const segments = layout?.segments ?? null;
      const breakZones = layout?.breaks ?? null;
      const clickNs = pixelToNs(mouseX, segments, breakZones, labelWidthRef.current, drawW, vsNs, veNs);

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
    const drawW = rect.width - labelWidthRef.current;
    const mouseX = e.clientX - rect.left - labelWidthRef.current;
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
    const drawW = rect.width - labelWidthRef.current;
    if (drawW <= 0) return;

    const mouseX = e.clientX - rect.left - labelWidthRef.current;
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
      setIsResizingLabel(false);
      dragRef.current = null;
      minimapDragRef.current = null;
    };
    const move = (e: MouseEvent) => {
      if (!isResizingLabel) return;
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const newWidth = Math.max(80, Math.min(600, e.clientX - rect.left));
      labelWidthRef.current = newWidth;
      setLabelWidth(newWidth);
    };
    window.addEventListener("mouseup", up);
    window.addEventListener("mousemove", move);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("mousemove", move);
    };
  }, [isResizingLabel]);

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
        <button className="btn btn-secondary btn-sm" onClick={zoomIn} title="Zoom In" style={{ padding: "5px 8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button className="btn btn-secondary btn-sm" onClick={zoomOut} title="Zoom Out" style={{ padding: "5px 8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button className="btn btn-secondary btn-sm" onClick={resetZoom} title="Reset Zoom" style={{ padding: "5px 8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
          {formatNs(viewRange)}
        </span>
        {/* State filter toggles */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, marginLeft: "auto" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            Compact
          </label>
          {Object.entries(STATE_COLORS).map(([state, color]) => {
            const isHidden = hiddenStates.has(state);
            return (
              <button
                key={state}
                onClick={() => {
                  const next = new Set(hiddenStates);
                  if (next.has(state)) next.delete(state); else next.add(state);
                  hiddenStatesRef.current = next;
                  setHiddenStates(next);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
                  borderRadius: 4,
                  opacity: isHidden ? 0.35 : 1,
                  color: "var(--text-secondary)",
                  textDecoration: isHidden ? "line-through" : "none",
                }}
                title={isHidden ? `Show ${state}` : `Hide ${state}`}
              >
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
                {state}
              </button>
            );
          })}
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-secondary)" }}>
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

      {/* Main canvas with resize handle */}
      <div style={{ position: "relative", flex: 1, minHeight: 300 }}>
        <canvas
          ref={mainCanvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            cursor: isDragging ? "grabbing" : "default",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (isDragging) { setIsDragging(false); dragRef.current = null; } }}
        />
        {/* Label column resize handle */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: labelWidth - 2,
            width: 5,
            height: "100%",
            cursor: "col-resize",
            zIndex: 10,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizingLabel(true);
          }}
        />
      </div>

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
            {onAiAnalyze && (
              <>
                <button
                  className="btn-ai"
                  style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 11 }}
                  onClick={() => {
                    // Get adjacent spans for context
                    const g = data.goroutines.find((g) => g.id === selectedSpan.goroutineId);
                    const spanIdx = g?.spans.findIndex((s) => s.start === selectedSpan.startNs && s.end === selectedSpan.endNs) ?? -1;
                    const adjacent = g?.spans.slice(Math.max(0, spanIdx - 2), spanIdx + 3).map((s) => ({
                      state: s.state, start: s.start, end: s.end, reason: s.reason, stack: s.stack,
                    })) || [];
                    onAiAnalyze("trace-span", {
                      span: { state: selectedSpan.state, start: selectedSpan.startNs, end: selectedSpan.endNs, reason: selectedSpan.reason, stack: selectedSpan.stack },
                      goroutineName: selectedSpan.goroutineName,
                      adjacentSpans: adjacent,
                    });
                  }}
                >
                  Explain Span
                </button>
                <button
                  className="btn-ai"
                  style={{ padding: "2px 10px", fontSize: 11 }}
                  onClick={() => onAiAnalyze("trace-goroutine", { goroutineId: selectedSpan.goroutineId })}
                >
                  Explain Goroutine
                </button>
              </>
            )}
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: onAiAnalyze ? undefined : "auto" }}
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
