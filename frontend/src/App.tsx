import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Connections from "./pages/Connections";
import ConnectionDetail from "./pages/ConnectionDetail";
import ProfileViewer from "./pages/ProfileViewer";
import Setup from "./pages/Setup";
import { api } from "./api";
import type { Target } from "./api";
import "./App.css";

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
            <Route path="/profiles/:id" element={<ProfileViewer />} />
            <Route path="/setup" element={<Setup />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function Sidebar() {
  const [targets, setTargets] = useState<Target[]>([]);
  const location = useLocation();

  useEffect(() => {
    const load = () => api.listTargets().then(setTargets).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="20" height="20" rx="4" fill="var(--accent)" fillOpacity="0.2" stroke="var(--accent)" strokeWidth="1.5"/>
            <path d="M7 17V10M12 17V7M17 17V13" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/>
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

        {targets.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {targets.map((t) => {
              const basePath = `/connections/${t.id}`;
              const isConnectionActive = location.pathname.startsWith(basePath);
              const displayUrl = t.url.replace(/^https?:\/\//, "");

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
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{displayUrl}</span>
                  </div>
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
            Setup
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}

export default App;
