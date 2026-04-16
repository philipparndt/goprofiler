const RECORDING_TYPES = new Set(["cpu"]);

export default function ProfileTypeBadge({ type }: { type: string }) {
  const isRecording = RECORDING_TYPES.has(type);

  return (
    <span className="badge badge-info" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {isRecording ? (
        <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#ef4444" /></svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="3" />
        </svg>
      )}
      {type}
    </span>
  );
}
