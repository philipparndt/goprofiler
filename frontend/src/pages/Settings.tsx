import { useEffect, useState } from "react";
import { api, isWails } from "../api";

interface AIProvider {
  id: string;
  name: string;
  available: boolean;
}

export default function Settings() {
  const [aiProvider, setAiProvider] = useState("claude");
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isWails()) return;
    api.getSettings().then((s) => {
      if (s.aiProvider) setAiProvider(s.aiProvider);
    }).catch(() => {});
    api.getAvailableAIProviders().then(setProviders).catch(() => {});
  }, []);

  const handleSave = async (providerId: string) => {
    setAiProvider(providerId);
    await api.updateSettings({ aiProvider: providerId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!isWails()) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Settings</h1>
        <p style={{ color: "var(--text-muted)" }}>Settings are only available in the desktop app.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Settings</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>AI Provider</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Choose which AI CLI tool to use for flame graph analysis. The tool must be installed and authenticated on your machine.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {providers.map((p) => (
            <label
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${aiProvider === p.id ? "var(--accent, #8b5cf6)" : "var(--border)"}`,
                background: aiProvider === p.id ? "rgba(139, 92, 246, 0.08)" : "transparent",
                cursor: p.available ? "pointer" : "default",
                opacity: p.available ? 1 : 0.5,
              }}
              onClick={() => { if (p.available) handleSave(p.id); }}
            >
              <input
                type="radio"
                name="aiProvider"
                checked={aiProvider === p.id}
                disabled={!p.available}
                onChange={() => { if (p.available) handleSave(p.id); }}
                style={{ accentColor: "var(--accent, #8b5cf6)" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {p.id === "claude" && "Uses 'claude' CLI (Claude Code)"}
                  {p.id === "gh-copilot" && "Uses 'gh copilot' CLI (GitHub Copilot)"}
                </div>
              </div>
              <span style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                background: p.available ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: p.available ? "var(--success, #22c55e)" : "var(--danger, #ef4444)",
              }}>
                {p.available ? "Installed" : "Not found"}
              </span>
            </label>
          ))}
        </div>

        {saved && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--success, #22c55e)" }}>
            Settings saved
          </div>
        )}
      </div>
    </div>
  );
}
