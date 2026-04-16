import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Target, StartProfileRequest } from "../api";

type ProfileType = "cpu" | "heap" | "goroutine" | "block" | "mutex" | "all_snapshots";

export default function Connections() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [savedTargets, setSavedTargets] = useState<Target[]>([]);
  const [url, setUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = () => {
    api.listTargets().then(setTargets).catch(() => {});
    api.listSavedTargets().then(setSavedTargets).catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const connect = async () => {
    if (!url.trim()) return;
    setConnecting(true);
    setError("");
    try {
      await api.connect(url.trim());
      setUrl("");
      load();
    } catch (e: any) {
      setError(e.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async (id: string) => {
    await api.disconnect(id);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Connections</h1>
        <p>Manage your pprof target connections</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Add Connection</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="http://localhost:6060"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connect()}
          />
          <button className="btn btn-primary" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)", marginTop: 8, fontSize: 13 }}>{error}</p>}
      </div>

      {targets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
          {targets.map((t) => (
            <TargetCard key={t.id} target={t} onDisconnect={disconnect} onProfileDone={() => navigate("/profiles")} />
          ))}
        </div>
      )}

      {savedTargets.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" }}>Saved Connections</h2>
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Last Connected</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {savedTargets.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.url}</td>
                    <td>{t.lastConnected ? new Date(t.lastConnected).toLocaleString() : "\u2014"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={async () => { await api.reconnect(t.id); load(); }}>
                          Reconnect
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={async () => { await api.removeSavedTarget(t.id); load(); }}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {targets.length === 0 && savedTargets.length === 0 && (
        <div className="empty-state">
          <h3>No connections yet</h3>
          <p>Add a connection to a Go application's pprof endpoint above.</p>
        </div>
      )}
    </div>
  );
}

function TargetCard({ target, onDisconnect, onProfileDone }: {
  target: Target;
  onDisconnect: (id: string) => void;
  onProfileDone: () => void;
}) {
  const [profileType, setProfileType] = useState<ProfileType>("cpu");
  const [duration, setDuration] = useState(30);
  const [profiling, setProfiling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProfile = async () => {
    setProfiling(true);
    setError("");
    setProgress(0);

    // Start client-side progress timer for CPU profiles
    if (profileType === "cpu") {
      const startTime = Date.now();
      const totalMs = duration * 1000;
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setProgress(Math.min(elapsed / totalMs, 0.99));
      }, 200);
    }

    try {
      const req: StartProfileRequest = { type: profileType };
      if (profileType === "cpu") {
        req.durationSec = duration;
      }
      await api.startProfile(target.id, req);
      setProgress(1);
      setTimeout(() => onProfileDone(), 500);
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

  const cancelProfile = async () => {
    try {
      await api.cancelProfile(target.id);
    } catch {}
    setProfiling(false);
    setProgress(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const recordTypes: { value: ProfileType; label: string }[] = [
    { value: "cpu", label: "CPU" },
  ];
  const snapshotTypes: { value: ProfileType; label: string }[] = [
    { value: "heap", label: "Heap" },
    { value: "goroutine", label: "Goroutine" },
    { value: "block", label: "Block" },
    { value: "mutex", label: "Mutex" },
    { value: "all_snapshots", label: "All" },
  ];

  const isRecording = profileType === "cpu";

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`status-dot ${target.status}`} />
          <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>{target.url}</span>
          <span className={`badge ${target.status === "connected" ? "badge-success" : "badge-danger"}`}>
            {target.status}
          </span>
        </div>
        <button className="btn btn-danger btn-sm" onClick={() => onDisconnect(target.id)} disabled={profiling}>
          Disconnect
        </button>
      </div>

      {target.status === "connected" && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* Record group */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#ef4444" /></svg>
                Record
              </span>
              {recordTypes.map((pt) => (
                <button
                  key={pt.value}
                  className={`btn btn-sm ${profileType === pt.value ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setProfileType(pt.value)}
                  disabled={profiling}
                >
                  {pt.label}
                </button>
              ))}
            </div>

            <span style={{ color: "var(--border)", fontSize: 18 }}>|</span>

            {/* Snapshot group */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="3" />
                </svg>
                Snapshot
              </span>
              {snapshotTypes.map((pt) => (
                <button
                  key={pt.value}
                  className={`btn btn-sm ${profileType === pt.value ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setProfileType(pt.value)}
                  disabled={profiling}
                >
                  {pt.label}
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

            {!profiling ? (
              <button className="btn btn-primary btn-sm" onClick={startProfile}>
                {isRecording ? "Record" : "Capture"}
              </button>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={cancelProfile}>
                Cancel
              </button>
            )}
          </div>

          {profiling && profileType === "cpu" && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                <span>Collecting CPU profile...</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          )}

          {profiling && profileType !== "cpu" && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
              Collecting {profileType === "all_snapshots" ? "all snapshot profiles" : `${profileType} profile`}...
            </div>
          )}

          {error && <p style={{ color: "var(--danger)", marginTop: 8, fontSize: 13 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
