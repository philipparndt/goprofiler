import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Target, ProfileMeta, StartProfileRequest } from "../api";
import ProfileTypeBadge from "../components/ProfileTypeBadge";

type ProfileType = "cpu" | "heap" | "goroutine" | "block" | "mutex" | "all_snapshots";

export default function ConnectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [target, setTarget] = useState<Target | null>(null);
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [notFound, setNotFound] = useState(false);

  const loadTarget = () => {
    // Try active targets first, then saved
    Promise.all([api.listTargets(), api.listSavedTargets()]).then(([active, saved]) => {
      const all = [...active, ...saved];
      const found = all.find((t) => t.id === id);
      if (found) {
        setTarget(found);
        loadProfiles(found.url);
      } else {
        setNotFound(true);
      }
    }).catch(() => setNotFound(true));
  };

  const loadProfiles = (url: string) => {
    api.listProfiles({ target: url, type: typeFilter || undefined }).then(setProfiles).catch(() => {});
  };

  useEffect(() => { loadTarget(); }, [id]);
  useEffect(() => { if (target) loadProfiles(target.url); }, [typeFilter]);

  const disconnect = async () => {
    if (!id) return;
    await api.disconnect(id);
    loadTarget();
  };

  const reconnect = async () => {
    if (!id) return;
    await api.reconnect(id);
    loadTarget();
  };

  const remove = async () => {
    if (!id) return;
    await api.removeSavedTarget(id);
    navigate("/connections");
  };

  const deleteProfile = async (profileId: string) => {
    await api.deleteProfile(profileId);
    if (target) loadProfiles(target.url);
  };

  if (notFound) {
    return (
      <div>
        <div className="page-header">
          <h1>Connection Not Found</h1>
        </div>
        <Link to="/connections" className="btn btn-primary">Back to Connections</Link>
      </div>
    );
  }

  if (!target) {
    return <div className="page-header"><h1>Loading...</h1></div>;
  }

  const isActive = target.status === "connected" || target.status === "unreachable";

  return (
    <div>
      {/* Status bar */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/connections" className="btn btn-secondary btn-sm">&larr;</Link>
          <span className={`status-dot ${target.status}`} />
          <div>
            <h1 className="mono" style={{ fontSize: 18 }}>{target.url}</h1>
            <p>
              <span className={`badge ${target.status === "connected" ? "badge-success" : target.status === "unreachable" ? "badge-danger" : "badge-warning"}`}>
                {target.status}
              </span>
              {target.lastCheck && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>Last check: {new Date(target.lastCheck).toLocaleTimeString()}</span>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isActive ? (
            <button className="btn btn-danger btn-sm" onClick={disconnect}>Disconnect</button>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" onClick={reconnect}>Reconnect</button>
              <button className="btn btn-danger btn-sm" onClick={remove}>Remove</button>
            </>
          )}
        </div>
      </div>

      {/* Profiling controls -- only for active connections */}
      {target.status === "connected" && (
        <ProfilingControls
          targetId={target.id}
          onComplete={() => { if (target) loadProfiles(target.url); }}
        />
      )}

      {/* Profiles list */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Profiles</h2>
          <div style={{ display: "flex", gap: 6 }}>
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
        </div>

        {profiles.length > 0 ? (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
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
                    <td>{new Date(p.timestamp).toLocaleString()}</td>
                    <td>{p.durationSec ? `${p.durationSec}s` : "instant"}</td>
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
          <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
            No profiles collected yet.{target.status === "connected" ? " Use the controls above to start profiling." : " Reconnect to collect new profiles."}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfilingControls({ targetId, onComplete }: { targetId: string; onComplete: () => void }) {
  const [profileType, setProfileType] = useState<ProfileType>("cpu");
  const [duration, setDuration] = useState(30);
  const [profiling, setProfiling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRecording = profileType === "cpu";

  const startProfile = async () => {
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
      await api.startProfile(targetId, req);
      setProgress(1);
      onComplete();
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
    try { await api.cancelProfile(targetId); } catch {}
    setProfiling(false);
    setProgress(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* Record group */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#ef4444" /></svg>
            Record
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
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="3" />
            </svg>
            Snapshot
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
