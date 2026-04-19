interface ContextMenuProps {
  x: number;
  y: number;
  functionName: string;
  onExplain: () => void;
  onClose: () => void;
  disabled?: boolean;
}

export default function ContextMenu({ x, y, functionName, onExplain, onClose, disabled }: ContextMenuProps) {
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
        <button
          style={{
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
          }}
          disabled={disabled}
          onMouseEnter={(e) => { if (!disabled) (e.target as HTMLElement).style.background = "var(--bg-hover, #2a2a3e)"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "none"; }}
          onClick={() => { if (!disabled) { onExplain(); onClose(); } }}
        >
          Explain this function
          {disabled && <span style={{ fontSize: 11, display: "block", color: "var(--text-muted)" }}>Configure source directory first</span>}
        </button>
      </div>
    </>
  );
}
