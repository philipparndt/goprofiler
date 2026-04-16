import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import Dashboard from "./pages/Dashboard";
import Connections from "./pages/Connections";
import ConnectionDetail from "./pages/ConnectionDetail";
import ProfileViewer from "./pages/ProfileViewer";
import DiffViewer from "./pages/DiffViewer";
import Setup from "./pages/Setup";
import { api } from "./api";
import type { Target } from "./api";
import "./App.css";

// Simple event bus for connection state changes
const connectionListeners = new Set<() => void>();
export function refreshSidebar() {
  connectionListeners.forEach((fn) => fn());
}
export function onConnectionChange(fn: () => void) {
  connectionListeners.add(fn);
  return () => { connectionListeners.delete(fn); };
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/connections/:id" element={<Navigate to="profiling" replace />} />
            <Route path="/connections/:id/profiling" element={<ConnectionDetail />} />
            <Route path="/connections/:id/monitor" element={<ConnectionDetail />} />
            <Route path="/connections/:id/info" element={<ConnectionDetail />} />
            <Route path="/connections/:id/expvars" element={<ConnectionDetail />} />
            <Route path="/profiles/diff" element={<DiffViewer />} />
            <Route path="/profiles/:id" element={<ProfileViewer />} />
            <Route path="/setup" element={<Setup />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function Sidebar() {
  const [activeTargets, setActiveTargets] = useState<Target[]>([]);
  const [savedTargets, setSavedTargets] = useState<Target[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.listTargets().then(setActiveTargets).catch(() => {});
    api.listSavedTargets().then(setSavedTargets).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    connectionListeners.add(load);
    return () => {
      clearInterval(interval);
      connectionListeners.delete(load);
    };
  }, [load]);

  const allTargets = [...activeTargets, ...savedTargets];

  const handleReconnect = async (id: string) => {
    try {
      await api.reconnect(id);
      refreshSidebar();
      navigate(`/connections/${id}/profiling`);
    } catch {}
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sidebar-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#16162a"/>
                <stop offset="100%" stopColor="#1a1a2e"/>
              </linearGradient>
              <linearGradient id="sidebar-flame" x1="0" y1="1" x2="0.3" y2="0">
                <stop offset="0%" stopColor="#6366f1"/>
                <stop offset="60%" stopColor="#8b5cf6"/>
                <stop offset="100%" stopColor="#22c55e"/>
              </linearGradient>
              <linearGradient id="sidebar-border" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6"/>
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3"/>
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="30" height="30" rx="7" fill="url(#sidebar-bg)" stroke="url(#sidebar-border)" strokeWidth="1.2"/>
            <path d="M5 25 V22 C6 22 7 19 8 17 C9 15 9.5 18 10.5 14 C11.5 10 12 13 13 9 C14 5 14.5 7 15.5 4 C16.5 7 17 5 18 8 C19 11 19.5 7 20.5 10 C21.5 13 22 11 23 14 C24 17 24.5 15 25.5 18 C26.5 21 27 19 27 22 V25 Z" fill="url(#sidebar-flame)" opacity="0.9"/>
            <path d="M5 22 C6 22 7 19 8 17 C9 15 9.5 18 10.5 14 C11.5 10 12 13 13 9 C14 5 14.5 7 15.5 4 C16.5 7 17 5 18 8 C19 11 19.5 7 20.5 10 C21.5 13 22 11 23 14 C24 17 24.5 15 25.5 18 C26.5 21 27 19 27 22" fill="none" stroke="#a78bfa" strokeWidth="0.8" opacity="0.6"/>
          </svg>
          <span>GoProfiler</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          Dashboard
        </NavLink>
        <NavLink to="/connections" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          Connections
        </NavLink>

        {allTargets.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {allTargets.map((t) => {
              const basePath = `/connections/${t.id}`;
              const isConnectionActive = location.pathname.startsWith(basePath);
              const displayUrl = t.url.replace(/^https?:\/\//, "");
              const isConnected = t.status === "connected" || t.status === "unreachable";

              return (
                <div key={t.id} style={{ marginBottom: 2 }}>
                  <div
                    style={{
                      padding: "6px 12px 6px 20px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: isConnectionActive ? "var(--text-primary)" : "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "var(--font-mono)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span className={`status-dot ${t.status}`} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{displayUrl}</span>
                    {!isConnected && (
                      <button
                        onClick={() => handleReconnect(t.id)}
                        title="Reconnect"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 2,
                          color: "var(--success)",
                          flexShrink: 0,
                          display: "flex",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {isConnected && (
                    <>
                      <NavLink
                        to={`${basePath}/profiling`}
                        className={({ isActive }) => `nav-item nav-sub-item ${isActive ? "active" : ""}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20V10M18 20V4M6 20v-4"/>
                        </svg>
                        Profiling
                      </NavLink>
                      <NavLink
                        to={`${basePath}/monitor`}
                        className={({ isActive }) => `nav-item nav-sub-item ${isActive ? "active" : ""}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                        </svg>
                        Monitor
                      </NavLink>
                      <NavLink
                        to={`${basePath}/info`}
                        className={({ isActive }) => `nav-item nav-sub-item ${isActive ? "active" : ""}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        Info
                      </NavLink>
                      <NavLink
                        to={`${basePath}/expvars`}
                        className={({ isActive }) => `nav-item nav-sub-item ${isActive ? "active" : ""}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
                        </svg>
                        Expvars
                      </NavLink>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <NavLink to="/setup" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            Quick Start
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}

export default App;
