import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import Dashboard from "./pages/Dashboard";
import Connections from "./pages/Connections";
import ConnectionDetail from "./pages/ConnectionDetail";
import ProfileViewer from "./pages/ProfileViewer";
import DiffViewer from "./pages/DiffViewer";
import Setup from "./pages/Setup";
import Settings from "./pages/Settings";
import { api } from "./api";
import LanguageBadge from "./components/LanguageBadge";
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

// Sidebar resize bounds + persistence
const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 480;
const DEFAULT_SIDEBAR = 240;
const SIDEBAR_STORAGE_KEY = "goprofiler.sidebarWidth";

function readSavedSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw == null) return DEFAULT_SIDEBAR;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < MIN_SIDEBAR || parsed > MAX_SIDEBAR) {
      return DEFAULT_SIDEBAR;
    }
    return parsed;
  } catch {
    return DEFAULT_SIDEBAR;
  }
}

function saveSidebarWidth(w: number): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(Math.round(w)));
  } catch {
    /* localStorage unavailable — skip persistence */
  }
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
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function Sidebar() {
  const [activeTargets, setActiveTargets] = useState<Target[]>([]);
  const [savedTargets, setSavedTargets] = useState<Target[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readSavedSidebarWidth());
  const [handleHover, setHandleHover] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsedConns, setCollapsedConns] = useState<Set<string>>(new Set());
  const dragging = useRef(false);

  const toggleConnectionCollapsed = useCallback((id: string) => {
    setCollapsedConns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const location = useLocation();
  const navigate = useNavigate();

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (dragging.current) return;
    dragging.current = true;
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    let latest = startWidth;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      latest = Math.max(
        MIN_SIDEBAR,
        Math.min(MAX_SIDEBAR, startWidth + (ev.clientX - startX)),
      );
      setSidebarWidth(latest);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setIsResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      saveSidebarWidth(latest);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

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

  const displayName = (t: Target) => t.label || t.url.replace(/^https?:\/\//, "");
  const allTargets = [...activeTargets, ...savedTargets].sort((a, b) => displayName(a).localeCompare(displayName(b)));

  const handleReconnect = async (id: string) => {
    try {
      await api.reconnect(id);
      refreshSidebar();
      navigate(`/connections/${id}/profiling`);
    } catch {}
  };

  return (
    <aside
      className="sidebar"
      style={{ width: sidebarWidth, minWidth: sidebarWidth }}
    >
      <div
        onMouseDown={handleResizeStart}
        onMouseEnter={() => setHandleHover(true)}
        onMouseLeave={() => setHandleHover(false)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        style={{
          position: "absolute",
          top: 0,
          right: -4,
          width: 8,
          height: "100%",
          cursor: "col-resize",
          zIndex: 10,
          background: "transparent",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {/* Visible vertical strip in the middle of the hit area. Wider + more
            opaque while hovered or actively dragging so the user can see
            exactly what they're grabbing. */}
        <div
          style={{
            width: isResizing || handleHover ? 3 : 1,
            height: "100%",
            background: isResizing || handleHover
              ? "var(--accent, #8b5cf6)"
              : "var(--border)",
            transition: "background 0.12s ease, width 0.12s ease",
          }}
        />
      </div>
      <div className="sidebar-header">
        <div className="logo">
          <img src="/logo.svg" alt="GoProfiler" width="28" height="28" />
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
              const displayUrl = displayName(t);
              const isConnected = t.status === "connected" || t.status === "unreachable";

              const isCollapsed = collapsedConns.has(t.id);

              return (
                <div key={t.id} style={{ marginBottom: 2 }}>
                  <NavLink
                    to={`${basePath}/info`}
                    style={{
                      padding: "6px 12px 6px 6px",
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
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                  >
                    {isConnected ? (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleConnectionCollapsed(t.id); }}
                        aria-label={isCollapsed ? "Expand connection" : "Collapse connection"}
                        aria-expanded={!isCollapsed}
                        title={isCollapsed ? "Expand" : "Collapse"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          width: 14,
                          height: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                            transition: "transform 0.12s ease",
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    ) : (
                      <span style={{ width: 14, flexShrink: 0 }} />
                    )}
                    <span className={`status-dot ${t.status}`} style={{ flexShrink: 0 }} />
                    <LanguageBadge language={t.language || "go"} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{displayUrl}</span>
                    {!isConnected && (
                      <button
                        onClick={(e) => { e.preventDefault(); handleReconnect(t.id); }}
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
                  </NavLink>
                  {isConnected && !isCollapsed && (
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
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            Settings
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}

export default App;
