import { useState } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  functionName: string;
  /** AI explanation entry; omit to hide (e.g. no AI CLI installed). */
  onExplain?: () => void;
  /** Copy the segment + children as text; resolves true on success. */
  onCopy?: () => Promise<boolean>;
  onClose: () => void;
  disabled?: boolean;
}

const itemStyle = (disabled?: boolean): React.CSSProperties => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 12px",
  fontSize: 13,
  background: "none",
  border: "none",
  color: disabled ? "var(--text-muted)" : "var(--text-primary)",
  cursor: disabled ? "default" : "pointer",
  borderRadius: 4,
});

const hover = (disabled?: boolean) => ({
  onMouseEnter: (e: React.MouseEvent) => { if (!disabled) (e.target as HTMLElement).style.background = "var(--bg-hover, #2a2a3e)"; },
  onMouseLeave: (e: React.MouseEvent) => { (e.target as HTMLElement).style.background = "none"; },
});

export default function ContextMenu({ x, y, functionName, onExplain, onCopy, onClose, disabled }: ContextMenuProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 199 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        style={{
          position: "fixed",
          left: x,
          top: y,
          zIndex: 200,
          background: "var(--bg-surface, #1a1a2e)",
          border: "1px solid var(--border, #333)",
          borderRadius: 6,
          padding: 4,
          minWidth: 200,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            padding: "6px 12px",
            fontSize: 12,
            color: "var(--text-muted)",
            borderBottom: "1px solid var(--border)",
            marginBottom: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 300,
          }}
        >
          {functionName}
        </div>
        {onCopy && (
          <button
            style={itemStyle()}
            {...hover()}
            onClick={async () => {
              const ok = await onCopy();
              setCopyState(ok ? "copied" : "failed");
              // Leave brief visual feedback before the menu disappears.
              setTimeout(onClose, ok ? 500 : 1200);
            }}
          >
            {copyState === "idle" && "Copy as text (with children)"}
            {copyState === "copied" && "Copied ✓"}
            {copyState === "failed" && "Copy failed"}
          </button>
        )}
        {onExplain && (
          <button
            style={itemStyle(disabled)}
            disabled={disabled}
            {...hover(disabled)}
            onClick={() => { if (!disabled) { onExplain(); onClose(); } }}
          >
            Explain this function
            {disabled && <span style={{ fontSize: 11, display: "block", color: "var(--text-muted)" }}>Configure source directory first</span>}
          </button>
        )}
      </div>
    </>
  );
}
