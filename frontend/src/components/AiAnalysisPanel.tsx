import { useEffect, useRef, useState, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";

SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("golang", go);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);
SyntaxHighlighter.registerLanguage("diff", diff);
import { api } from "../api";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { isWails } from "../api";

interface AiAnalysisPanelProps {
  visible: boolean;
  onClose: () => void;
  onFollowUp?: (message: string) => void;
  permLevel: "read-only" | "edit-files" | "full";
  onPermLevelChange: (v: "read-only" | "edit-files" | "full") => void;
  error?: string;
}

export default function AiAnalysisPanel({ visible, onClose, onFollowUp, permLevel, onPermLevelChange, error }: AiAnalysisPanelProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(520);
  const contentRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);

  useEffect(() => {
    if (visible) {
      setContent("");
      setLoading(true);
      setActivity("");
      setCopied(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !isWails()) return;

    const cleanupEvent = EventsOn("ai:event", (evt: any) => {
      if (evt.activity) setActivity(evt.activity);
      if (evt.type === "result" && evt.content) {
        setContent(evt.content);
        setActivity("");
      } else if (evt.content) {
        setContent((prev) => prev + evt.content);
      }
      if (evt.error) {
        setContent((prev) => prev + "\n\n**Error:** " + evt.error);
        setLoading(false);
        setActivity("");
      }
    });

    const cleanupDone = EventsOn("ai:done", () => {
      setLoading(false);
      setActivity("");
    });

    return () => { cleanupEvent(); cleanupDone(); };
  }, [visible]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [content]);

  useEffect(() => {
    if (error) { setLoading(false); setActivity(""); }
  }, [error]);

  const handleCancel = () => {
    api.cancelAnalysis().catch(() => {});
    setLoading(false);
    setActivity("");
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const newWidth = Math.max(320, Math.min(window.innerWidth - 200, startWidth + (startX - e.clientX)));
      setWidth(newWidth);
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  if (!visible) return null;

  let displayError: string | undefined;
  if (error) {
    displayError = error.includes("source directory")
      ? "No source directory configured.\n\nTo use AI analysis:\n1. Go to the target's **Info** tab\n2. Set the **Source Directory** to your Go project root\n3. Come back here and try again"
      : "**Error:** " + error;
  }

  return (
    <div style={{
      position: "fixed",
      top: 0,
      right: 0,
      width,
      height: "100vh",
      background: "var(--bg-primary)",
      borderLeft: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      zIndex: 100,
      boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
    }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute",
          left: -3,
          top: 0,
          width: 6,
          height: "100%",
          cursor: "col-resize",
          zIndex: 101,
        }}
      />

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>AI Analysis</span>
          {loading && (
            <span style={{
              display: "inline-block",
              width: 8, height: 8,
              borderRadius: "50%",
              background: "var(--success, #22c55e)",
              animation: "pulse 1.5s infinite",
            }} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {content && !loading && (
            <button className="btn btn-secondary btn-sm" onClick={handleCopyAll}>
              {copied ? "Copied!" : "Copy All"}
            </button>
          )}
          {loading && (
            <button className="btn btn-danger btn-sm" onClick={handleCancel}>Cancel</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { handleCancel(); setContent(""); onClose(); }}>Close</button>
        </div>
      </div>

      {/* Activity bar */}
      {loading && (
        <div style={{
          padding: "6px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg-secondary, #111)",
          flexShrink: 0,
        }}>
          <span style={{
            display: "inline-block",
            width: 12, height: 12,
            minWidth: 12, minHeight: 12,
            boxSizing: "border-box",
            border: "2px solid var(--text-muted)",
            borderTopColor: "var(--accent, #8b5cf6)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <span>{activity || "Thinking..."}</span>
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        className="ai-analysis-content"
        style={{
          flex: 1,
          overflow: "auto",
          padding: 16,
          fontSize: 14,
          lineHeight: 1.7,
          color: displayError ? "var(--danger, #ef4444)" : "var(--text-primary)",
          userSelect: "text",
          cursor: "text",
        }}
      >
        {displayError ? (
          <Markdown remarkPlugins={[remarkGfm]}>{displayError}</Markdown>
        ) : content ? (
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const code = String(children).replace(/\n$/, "");
                return match ? (
                  <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ margin: 0, borderRadius: 6, fontSize: 12 }}>
                    {code}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>{children}</code>
                );
              },
            }}
          >
            {content}
          </Markdown>
        ) : loading ? (
          <span style={{ color: "var(--text-muted)" }}>Starting AI analysis...</span>
        ) : (
          <Markdown remarkPlugins={[remarkGfm]}>{"No results received.\n\nCheck that:\n- Your AI CLI is installed and in your PATH\n- You are authenticated\n- A source directory is configured in the target's **Info** tab\n\nConfigure your AI provider in **Settings**."}</Markdown>
        )}
      </div>

      {/* Follow-up input */}
      {!loading && content && onFollowUp && (
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)" }}>Permissions:</span>
            <select
              value={permLevel}
              onChange={(e) => onPermLevelChange(e.target.value as any)}
              className="input"
              style={{ fontSize: 11, padding: "2px 6px", width: "auto" }}
            >
              <option value="read-only">Read-only</option>
              <option value="edit-files">Allow edits</option>
              <option value="full">Full (edits + commands)</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 13 }}
            placeholder="Follow up... (e.g. 'Yes, apply this fix')"
            value={followUpInput}
            onChange={(e) => setFollowUpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && followUpInput.trim()) {
                onFollowUp(followUpInput.trim());
                setFollowUpInput("");
                setContent("");
                setLoading(true);
              }
            }}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={!followUpInput.trim()}
            onClick={() => {
              if (followUpInput.trim()) {
                onFollowUp(followUpInput.trim());
                setFollowUpInput("");
                setContent("");
                setLoading(true);
              }
            }}
          >
            Send
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
