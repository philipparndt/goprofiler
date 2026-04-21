import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";

SyntaxHighlighter.registerLanguage("json", json);

export interface ExpvarValueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  value: unknown;
  stale?: boolean;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function prettyPrint(value: unknown): { text: string; isRawString: boolean } {
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed !== null) {
      return { text: JSON.stringify(parsed, null, 2), isRawString: false };
    }
    return { text: value, isRawString: true };
  }
  try {
    return { text: JSON.stringify(value, null, 2), isRawString: false };
  } catch {
    return { text: String(value), isRawString: true };
  }
}

type CopyState = "idle" | "copied" | "failed";

export default function ExpvarValueModal({ open, onOpenChange, name, value, stale }: ExpvarValueModalProps) {
  const { text, isRawString } = useMemo(() => prettyPrint(value), [value]);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const t = setTimeout(() => setCopyState("idle"), 1500);
    return () => clearTimeout(t);
  }, [copyState]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const copyLabel = copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
            zIndex: 2000,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(900px, 90vw)",
            maxHeight: "85vh",
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
            display: "flex",
            flexDirection: "column",
            zIndex: 2001,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <Dialog.Title
              className="mono"
              style={{ fontSize: 14, margin: 0, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {name}
            </Dialog.Title>
            {isRawString && (
              <span className="badge badge-info" style={{ fontSize: 10 }}>raw string</span>
            )}
            {stale && (
              <span className="badge" style={{ fontSize: 10, background: "var(--warning)", color: "var(--bg-primary)" }}>stale</span>
            )}
            <button
              type="button"
              onClick={onCopy}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                background: copyState === "failed" ? "var(--warning)" : "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {copyLabel}
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                style={{
                  fontSize: 16,
                  padding: "2px 8px",
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </Dialog.Close>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            {isRawString ? (
              <pre
                className="mono"
                style={{
                  margin: 0,
                  padding: 16,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--text-primary)",
                  background: "var(--bg-primary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {text}
              </pre>
            ) : (
              <SyntaxHighlighter
                language="json"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: 16,
                  fontSize: 12,
                  lineHeight: 1.5,
                  background: "var(--bg-primary)",
                  minHeight: "100%",
                }}
                codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
              >
                {text}
              </SyntaxHighlighter>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
