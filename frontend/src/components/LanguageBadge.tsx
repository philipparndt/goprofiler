import type { Language } from "../api";

const LANG_CONFIG: Record<Language, { label: string; color: string; bg: string }> = {
  go:   { label: "Go",   color: "#00add8", bg: "rgba(0, 173, 216, 0.12)" },
  java: { label: "Java", color: "#f89820", bg: "rgba(248, 152, 32, 0.12)" },
};

export default function LanguageBadge({ language }: { language: Language }) {
  const config = LANG_CONFIG[language] || LANG_CONFIG.go;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "1px 6px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.03em",
      color: config.color,
      background: config.bg,
      textTransform: "uppercase",
    }}>
      {config.label}
    </span>
  );
}
