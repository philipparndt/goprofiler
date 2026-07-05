import { technicalInputProps } from "../inputProps";
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
import { api, isWails, subscribeAIEvents } from "../api";

interface AiAnalysisPanelProps {
  visible: boolean;
  onClose: () => void;
  onFollowUp?: (message: string) => void;
  permLevel: "read-only" | "edit-files";
  onPermLevelChange: (v: "read-only" | "edit-files") => void;
  error?: string;
  /** Stream ID returned from api.startAnalysis / follow-up in web mode. Ignored in Wails. */
  streamId?: string;
  /** Target ID — enables in-panel source-directory setup when analysis fails for lack of one. */
  targetId?: string;
  /** Called after the user saves a source directory so the parent can re-run the analysis that failed. */
  onRetry?: () => void;
}

export default function AiAnalysisPanel({ visible, onClose, onFollowUp, permLevel, onPermLevelChange, error, streamId, targetId, onRetry }: AiAnalysisPanelProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(520);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [workingDir, setWorkingDir] = useState<string | undefined>();
  const [resumeCopyState, setResumeCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [provider, setProvider] = useState<string | undefined>();
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);

  useEffect(() => {
    if (visible) {
      setContent("");
      setLoading(true);
      setActivity("");
      setCopied(false);
      setSessionId(undefined);
      setWorkingDir(undefined);
      setResumeCopyState("idle");
      setCollapsed(false);
      setUnread(false);
    }
  }, [visible]);

  // A new streamId means the parent fired a fresh analysis (e.g. the inline
  // source-dir form retried after saving). The panel is already open so the
  // visible-effect above doesn't run — reset the run-specific state here so
  // the user sees "Starting AI analysis..." instead of the empty fallback
  // until the first event arrives.
  useEffect(() => {
    if (!streamId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContent("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivity("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(undefined);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkingDir(undefined);
  }, [streamId]);

  // When the run state changes while the panel is collapsed, flag "unread" so
  // the collapsed strip shows a dot and the user knows something happened.
  useEffect(() => {
    if (!collapsed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!loading) setUnread(true);
  }, [loading, collapsed]);
  useEffect(() => {
    if (!collapsed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (error) setUnread(true);
  }, [error, collapsed]);

  // Expanding the panel clears the unread marker.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!collapsed) setUnread(false);
  }, [collapsed]);

  // Fetch the active provider once per panel open so we can decide whether to
  // render a resume helper. `active` is set on the matching entry by the
  // backend based on the selected AI provider in settings.
  useEffect(() => {
    if (!visible) return;
    api.getAvailableAIProviders().then((ps) => {
      const active = ps.find((p) => p.active)?.id ?? ps.find((p) => p.available)?.id;
      setProvider(active);
    }).catch(() => { /* ignore — provider stays undefined, no resume hint */ });
  }, [visible]);

  useEffect(() => {
    if (resumeCopyState === "idle") return;
    const t = setTimeout(() => setResumeCopyState("idle"), 1500);
    return () => clearTimeout(t);
  }, [resumeCopyState]);

  useEffect(() => {
    if (!visible) return;

    const cleanup = subscribeAIEvents(
      streamId,
      (evt) => {
        if (typeof evt.sessionId === "string" && evt.sessionId.length > 0) {
          setSessionId(evt.sessionId);
        }
        if (typeof evt.workingDir === "string" && evt.workingDir.length > 0) {
          setWorkingDir(evt.workingDir);
        }
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
      },
      () => {
        setLoading(false);
        setActivity("");
      },
    );

    return cleanup;
  }, [visible, streamId]);

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

  if (collapsed) {
    return (
      <CollapsedStrip
        loading={loading}
        hasError={!!error}
        unread={unread}
        onExpand={() => setCollapsed(false)}
      />
    );
  }

  const needsSourceDir = !!error && error.includes("source directory") && !!targetId && !!onRetry;

  let displayError: string | undefined;
  if (error && !needsSourceDir) {
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
        gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 14, flexShrink: 0 }}>AI Analysis</span>
          {loading && (
            <span style={{
              display: "inline-block",
              width: 8, height: 8,
              borderRadius: "50%",
              background: "var(--success, #22c55e)",
              animation: "pulse 1.5s infinite",
              flexShrink: 0,
            }} />
          )}
          {sessionId && provider === "claude" && (
            <ResumeCommandButton
              sessionId={sessionId}
              workingDir={workingDir}
              copyState={resumeCopyState}
              onCopy={async () => {
                const cmd = workingDir
                  ? `cd "${workingDir}" && claude --resume ${sessionId}`
                  : `claude --resume ${sessionId}`;
                try {
                  await navigator.clipboard.writeText(cmd);
                  setResumeCopyState("copied");
                } catch {
                  setResumeCopyState("failed");
                }
              }}
            />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {content && !loading && (
            <button className="btn btn-secondary btn-sm" onClick={handleCopyAll}>
              {copied ? "Copied!" : "Copy All"}
            </button>
          )}
          {loading && (
            <button className="btn btn-danger btn-sm" onClick={handleCancel}>Cancel</button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCollapsed(true)}
            title="Hide panel (AI keeps running in the background)"
            aria-label="Hide panel (AI keeps running in the background)"
          >
            ‹
          </button>
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
        {needsSourceDir && targetId && onRetry ? (
          <SourceDirSetupForm
            targetId={targetId}
            onSaved={() => {
              // Reset run-specific state synchronously so the user sees a
              // "Starting AI analysis..." spinner while the retry's
              // api.startAnalysis call is in flight, not the stale fallback
              // from the previous (failed) run.
              setContent("");
              setLoading(true);
              setActivity("");
              setSessionId(undefined);
              setWorkingDir(undefined);
              onRetry();
            }}
          />
        ) : displayError ? (
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
              onChange={(e) => onPermLevelChange(e.target.value as "read-only" | "edit-files")}
              className="input"
              style={{ fontSize: 11, padding: "2px 6px", width: "auto" }}
            >
              <option value="read-only">Read-only</option>
              <option value="edit-files">Allow edits</option>
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

function ResumeCommandButton({ sessionId, workingDir, copyState, onCopy }: {
  sessionId: string;
  workingDir: string | undefined;
  copyState: "idle" | "copied" | "failed";
  onCopy: () => void;
}) {
  const cmd = workingDir
    ? `cd "${workingDir}" && claude --resume ${sessionId}`
    : `claude --resume ${sessionId}`;
  const label = copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Continue session in terminal";
  return (
    <button
      type="button"
      onClick={onCopy}
      title={`Copies this command so you can continue the AI session in your own terminal:\n\n${cmd}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        padding: "2px 8px",
        background: copyState === "failed" ? "var(--warning)" : "var(--bg-secondary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        cursor: "pointer",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      <CopyIcon />
      {label}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CollapsedStrip({ loading, hasError, unread, onExpand }: {
  loading: boolean;
  hasError: boolean;
  unread: boolean;
  onExpand: () => void;
}) {
  const statusLabel = hasError ? "AI error" : loading ? "AI running" : "AI ready";
  const ariaLabel = `Show AI panel (${hasError ? "error" : loading ? "running" : "ready"})`;
  const dotColor = hasError ? "var(--danger, #ef4444)" : loading ? "var(--success, #22c55e)" : "var(--text-muted)";

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 40,
        height: "100vh",
        background: "var(--bg-primary)",
        borderLeft: "1px solid var(--border)",
        borderTop: "none",
        borderBottom: "none",
        borderRight: "none",
        padding: "12px 0",
        cursor: "pointer",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        color: "var(--text-primary)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor,
          animation: loading ? "pulse 1.5s infinite" : undefined,
          flexShrink: 0,
        }}
      />
      {unread && (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--accent, #8b5cf6)",
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      )}
      <span
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontSize: 11,
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
          userSelect: "none",
        }}
      >
        {statusLabel}
      </span>
    </button>
  );
}

function SourceDirSetupForm({ targetId, onSaved }: { targetId: string; onSaved: () => void }) {
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canSubmit = path.trim() !== "" && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setSaveError("");
    try {
      await api.setSourceDir(targetId, path.trim());
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(msg || "Failed to save source directory");
      setSaving(false);
    }
  };

  const browse = async () => {
    try {
      const dir = await api.browseSourceDir();
      if (dir) setPath(dir);
    } catch {
      /* ignore — user cancelled or dialog failed */
    }
  };

  return (
    <div style={{ color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 8px 0" }}>Source directory required</h3>
      <p style={{ margin: "0 0 12px 0", color: "var(--text-muted)" }}>
        The AI needs to read your project source to explain the profile. Point it at the root of your codebase.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          ref={inputRef}
          className="input"
          type="text"
          {...technicalInputProps}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Path to source directory..."
          aria-label="Source directory path"
          style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 13 }}
          disabled={saving}
        />
        {isWails() && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={browse}
            disabled={saving}
            type="button"
          >
            Browse…
          </button>
        )}
      </div>

      {!isWails() && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px 0" }}>
          Absolute path on the server's filesystem, e.g. <span className="mono">/Users/you/projects/myrepo</span>.
        </p>
      )}

      {saveError && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--danger, #ef4444)",
            borderRadius: 4,
            color: "var(--danger, #ef4444)",
            fontSize: 12,
          }}
        >
          {saveError}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={!canSubmit}
          type="button"
        >
          {saving ? "Saving..." : "Save & Start"}
        </button>
      </div>
    </div>
  );
}
