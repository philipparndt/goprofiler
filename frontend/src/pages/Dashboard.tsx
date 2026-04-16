import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Target, ProfileMeta } from "../api";
import ProfileTypeBadge from "../components/ProfileTypeBadge";

export default function Dashboard() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);

  useEffect(() => {
    api.listTargets().then(setTargets).catch(() => {});
    api.listProfiles().then(setProfiles).catch(() => {});
  }, []);

  const connected = targets.filter((t) => t.status === "connected");

  if (connected.length === 0 && profiles.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1>Dashboard</h1>
        </div>
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <h3>Welcome to GoProfiler</h3>
          <p>Connect to a Go application's pprof endpoint to start profiling. You'll see beautiful flame graphs in no time.</p>
          <Link to="/connections" className="btn btn-primary">Add Connection</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your profiling targets and recent profiles</p>
      </div>

      {connected.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Active Connections</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {connected.map((t) => (
              <div key={t.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span className="status-dot connected" />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{t.url}</span>
                </div>
                <Link to={`/connections`} className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>
                  Profile
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {profiles.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Recent Profiles</h2>
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Timestamp</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {profiles.slice(0, 5).map((p) => (
                  <tr key={p.id}>
                    <td><ProfileTypeBadge type={p.type} /></td>
                    <td className="mono">{p.targetURL}</td>
                    <td>{new Date(p.timestamp).toLocaleString()}</td>
                    <td>{p.durationSec ? `${p.durationSec}s` : "snapshot"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
