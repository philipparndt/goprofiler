import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Target } from "../api";

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
      const target = await api.connect(url.trim());
      setUrl("");
      navigate(`/connections/${target.id}`);
    } catch (e: any) {
      setError(e.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Connections</h1>
        <p>Connect to Go applications and profile them</p>
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
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Active</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {targets.map((t) => (
              <ConnectionCard key={t.id} target={t} />
            ))}
          </div>
        </div>
      )}

      {savedTargets.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" }}>Saved</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {savedTargets.map((t) => (
              <ConnectionCard key={t.id} target={t} />
            ))}
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

function ConnectionCard({ target }: { target: Target }) {
  const isActive = target.status === "connected" || target.status === "unreachable";

  return (
    <Link
      to={`/connections/${target.id}`}
      className="card"
      style={{ textDecoration: "none", color: "inherit", padding: 16, transition: "border-color 0.15s", cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className={`status-dot ${target.status}`} />
        <span className="mono" style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{target.url}</span>
        <span className={`badge ${isActive ? (target.status === "connected" ? "badge-success" : "badge-danger") : "badge-warning"}`} style={{ fontSize: 10 }}>
          {target.status}
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
        <span>{target.profileCount ?? 0} profile{(target.profileCount ?? 0) !== 1 ? "s" : ""}</span>
        {target.lastConnected && <span>Last: {new Date(target.lastConnected).toLocaleDateString()}</span>}
      </div>
    </Link>
  );
}
