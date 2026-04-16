import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { ProfileMeta, Target, StartProfileRequest } from "../api";
import ProfileTypeBadge from "../components/ProfileTypeBadge";

type ProfileType = "cpu" | "heap" | "goroutine" | "block" | "mutex" | "all_snapshots";

export default function Profiles() {
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [showNewProfile, setShowNewProfile] = useState(false);

  const load = () => {
    api.listProfiles(typeFilter || undefined).then(setProfiles).catch(() => {});
  };

  useEffect(() => { load(); }, [typeFilter]);

  const deleteProfile = async (id: string) => {
    await api.deleteProfile(id);
    load();
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1>Profiles</h1>
          <p>View and manage collected profiles</p>
        </div>
        <button
          className="btn"
          onClick={() => setShowNewProfile(!showNewProfile)}
          style={{
            background: showNewProfile ? "var(--bg-surface)" : "var(--success)",
            color: showNewProfile ? "var(--text-secondary)" : "white",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {showNewProfile ? (
            <>Close</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              New Profile
            </>
          )}
        </button>
      </div>

      {showNewProfile && (
        <NewProfileCard
          onComplete={() => { setShowNewProfile(false); load(); }}
        />
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["", "cpu", "heap", "goroutine", "block", "mutex"].map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${typeFilter === t ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTypeFilter(t)}
          >
            {t || "All"}
          </button>
        ))}
      </div>

      {profiles.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Target</th>
                <th>Label</th>
                <th>Timestamp</th>
                <th>Duration</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td><ProfileTypeBadge type={p.type} /></td>
                  <td className="mono">{p.targetURL}</td>
                  <td>{p.label || "\u2014"}</td>
                  <td>{new Date(p.timestamp).toLocaleString()}</td>
                  <td>{p.durationSec ? `${p.durationSec}s` : "snapshot"}</td>
                  <td>{formatBytes(p.size)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Link to={`/profiles/${p.id}`} className="btn btn-primary btn-sm">View</Link>
                      <button className="btn btn-secondary btn-sm" onClick={() => api.exportProfile(p.id)}>Export</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteProfile(p.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <h3>No profiles yet</h3>
          <p>Connect to a target and start a profiling session to collect your first profile.</p>
        </div>
      )}
    </div>
  );
}

function NewProfileCard({ onComplete }: { onComplete: () => void }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [profileType, setProfileType] = useState<ProfileType>("cpu");
  const [duration, setDuration] = useState(30);
  const [profiling, setProfiling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.listTargets().then((t) => {
      const connected = t.filter((x) => x.status === "connected");
      setTargets(connected);
      if (connected.length > 0) setSelectedTarget(connected[0].id);
    }).catch(() => {});
  }, []);

  const isRecording = profileType === "cpu";

  const startProfile = async () => {
    if (!selectedTarget) return;
    setProfiling(true);
    setError("");
    setProgress(0);

    if (isRecording) {
      const startTime = Date.now();
      const totalMs = duration * 1000;
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setProgress(Math.min(elapsed / totalMs, 0.99));
      }, 200);
    }

    try {
      const req: StartProfileRequest = { type: profileType };
      if (isRecording) req.durationSec = duration;
      await api.startProfile(selectedTarget, req);
      setProgress(1);
      setTimeout(() => onComplete(), 500);
    } catch (e: any) {
      setError(e.message || "Profiling failed");
    } finally {
      setProfiling(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  if (targets.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 16, textAlign: "center", padding: 24 }}>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>No connected targets available.</p>
        <Link to="/connections" className="btn btn-primary btn-sm">Go to Connections</Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* Target selector */}
        <select
          className="input"
          style={{ width: "auto", minWidth: 200 }}
          value={selectedTarget}
          onChange={(e) => setSelectedTarget(e.target.value)}
          disabled={profiling}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>{t.url}</option>
          ))}
        </select>

        {/* Record group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#ef4444" /></svg>
          </span>
          <button
            className={`btn btn-sm ${profileType === "cpu" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setProfileType("cpu")}
            disabled={profiling}
          >CPU</button>
        </div>

        <span style={{ color: "var(--border)", fontSize: 18 }}>|</span>

        {/* Snapshot group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          {(["heap", "goroutine", "block", "mutex", "all_snapshots"] as ProfileType[]).map((pt) => (
            <button
              key={pt}
              className={`btn btn-sm ${profileType === pt ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setProfileType(pt)}
              disabled={profiling}
            >
              {pt === "all_snapshots" ? "All" : pt.charAt(0).toUpperCase() + pt.slice(1)}
            </button>
          ))}
        </div>

        {isRecording && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              className="input"
              type="number"
              min={1}
              max={300}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={profiling}
              style={{ width: 70, textAlign: "center" }}
            />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>sec</span>
          </div>
        )}

        <button
          className="btn btn-sm"
          onClick={startProfile}
          disabled={profiling}
          style={{ background: "var(--success)", color: "white" }}
        >
          {profiling ? "Collecting..." : isRecording ? "Record" : "Capture"}
        </button>
      </div>

      {profiling && isRecording && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            <span>Recording CPU profile...</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {profiling && !isRecording && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
          Capturing {profileType === "all_snapshots" ? "all snapshots" : `${profileType} snapshot`}...
        </div>
      )}

      {error && <p style={{ color: "var(--danger)", marginTop: 8, fontSize: 13 }}>{error}</p>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
