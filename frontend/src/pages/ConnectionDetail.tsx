import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { api, isWails } from "../api";
import type { Target, ProfileMeta, StartProfileRequest, ProcessInfo, AvailableProfile, Language } from "../api";

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
import ProfileTypeBadge from "../components/ProfileTypeBadge";
import { refreshSidebar, onConnectionChange } from "../App";
import MemoryChart from "../components/MemoryChart";
import JavaMonitorCharts from "../components/JavaMonitorCharts";
import GoroutineChart from "../components/GoroutineChart";
import CpuChart from "../components/CpuChart";
import ExpvarMetrics from "../components/ExpvarMetrics";

type ProfileType = "cpu" | "trace" | "heap" | "goroutine" | "block" | "mutex" | "allocs" | "threadcreate" | "all_snapshots" | "lock";

export default function ConnectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [target, setTarget] = useState<Target | null>(null);
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [addTagProfileId, setAddTagProfileId] = useState<string | null>(null);
  const [addTagInput, setAddTagInput] = useState("");
  const [compareBaseProfile, setCompareBaseProfile] = useState<ProfileMeta | null>(null);
  const [monitorWindow, setMonitorWindow] = useState(5); // minutes
  const [cpuEnabled, setCpuEnabled] = useState(false);
  const [cpuToggling, setCpuToggling] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [processInfo, setProcessInfo] = useState<ProcessInfo | null>(null);
  const [sourceDir, setSourceDir] = useState("");

  // Derive tab from URL path
  const tab = location.pathname.endsWith("/monitor") ? "monitor" : location.pathname.endsWith("/info") ? "info" : location.pathname.endsWith("/expvars") ? "expvars" : "profiling";

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
    api.listProfiles({ target: url, type: typeFilter || undefined, tag: tagFilter || undefined }).then(setProfiles).catch(() => {});
  };

  const loadTags = () => {
    api.listTags().then(setAvailableTags).catch(() => {});
  };

  useEffect(() => { loadTarget(); loadTags(); }, [id]);
  useEffect(() => {
    if (id) api.getProcessInfo(id).then(setProcessInfo).catch(() => {});
    if (id && isWails()) api.getSourceDir(id).then(setSourceDir).catch(() => {});
  }, [id]);
  // Re-fetch target when connection state changes (e.g. reconnect from sidebar)
  useEffect(() => {
    return onConnectionChange(() => {
      loadTarget();
      if (id) api.getProcessInfo(id).then(setProcessInfo).catch(() => {});
    });
  }, [id]);
  useEffect(() => { if (target) loadProfiles(target.url); }, [typeFilter, tagFilter]);
  // Check CPU monitoring status when monitor tab is shown (Go targets only)
  useEffect(() => {
    if (tab === "monitor" && id && (target?.language === "go" || !target?.language)) {
      api.getCpuHistory(id).then((res) => setCpuEnabled(res.active)).catch(() => {});
    }
  }, [tab, id, target?.language]);

  const disconnect = async () => {
    if (!id) return;
    await api.disconnect(id);
    loadTarget();
    refreshSidebar();
  };

  const reconnect = async () => {
    if (!id) return;
    await api.reconnect(id);
    loadTarget();
    refreshSidebar();
  };

  const remove = async () => {
    if (!id) return;
    await api.removeSavedTarget(id);
    refreshSidebar();
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
            <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className={`badge ${target.status === "connected" ? "badge-success" : target.status === "unreachable" ? "badge-danger" : "badge-warning"}`}>
                {target.status}
              </span>
              {processInfo && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {processInfo.cmdline?.length > 0 && (
                    <span title={processInfo.cmdline.join(" ")} style={{ marginRight: 8 }}>
                      {processInfo.cmdline[0].split("/").pop()}
                    </span>
                  )}
                  {processInfo.goVersion && <span style={{ marginRight: 8 }}>{processInfo.goVersion}</span>}
                  {processInfo.goos && processInfo.goarch && <span>{processInfo.goos}/{processInfo.goarch}</span>}
                </span>
              )}
              {target.lastCheck && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Last check: {new Date(target.lastCheck).toLocaleTimeString()}</span>}
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

      {/* Profiling tab */}
      {(tab === "profiling" || (target.status !== "connected" && tab !== "info")) && (
        <>
          {target.status === "connected" && (
            <ProfilingControls
              targetId={target.id}
              language={target.language || "go"}
              onComplete={(profileId) => {
                if (target) loadProfiles(target.url);
                if (profileId) navigate(`/profiles/${profileId}`);
              }}
            />
          )}

          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Profiles</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["", "cpu", "trace", "heap", "goroutine", "block", "mutex", "allocs", "threadcreate"].map((t) => (
                    <button
                      key={t}
                      className={`btn btn-sm ${typeFilter === t ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setTypeFilter(t)}
                    >
                      {t || "All"}
                    </button>
                  ))}
                </div>
                {availableTags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tag:</span>
                    <button
                      className={`btn btn-sm ${tagFilter === "" ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setTagFilter("")}
                    >
                      All
                    </button>
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        className={`btn btn-sm ${tagFilter === tag ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setTagFilter(tagFilter === tag ? "" : tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {profiles.length > 0 ? (
              <>
                <div className="card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Timestamp</th>
                        <th>Duration</th>
                        <th>Size</th>
                        <th>Tags</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map((p) => {
                        const tags = parseTags(p.tags);
                        const isAddingTag = addTagProfileId === p.id;
                        const isCompareBase = compareBaseProfile?.id === p.id;
                        return (
                          <tr key={p.id} style={{ background: isCompareBase ? "rgba(99,102,241,0.08)" : undefined }}>
                            <td><ProfileTypeBadge type={p.type} /></td>
                            <td>{new Date(p.timestamp).toLocaleString()}</td>
                            <td>{p.durationSec ? `${p.durationSec}s` : "instant"}</td>
                            <td>{formatBytes(p.size)}</td>
                            <td>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                                {tags.map((tag) => (
                                  <span
                                    key={tag}
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      background: "rgba(99,102,241,0.18)",
                                      color: "var(--accent)",
                                      border: "1px solid rgba(99,102,241,0.3)",
                                      letterSpacing: "0.03em",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 3,
                                    }}
                                  >
                                    {tag}
                                    <span
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const newTags = tags.filter((t) => t !== tag);
                                        await api.setTags(p.id, newTags);
                                        if (target) loadProfiles(target.url);
                                        loadTags();
                                      }}
                                      style={{ cursor: "pointer", opacity: 0.6, fontSize: 12, lineHeight: 1 }}
                                    >&times;</span>
                                  </span>
                                ))}
                                {isAddingTag ? (
                                  <form
                                    style={{ display: "flex", gap: 4 }}
                                    onSubmit={async (e) => {
                                      e.preventDefault();
                                      const newTag = addTagInput.trim();
                                      if (!newTag) return;
                                      const next = [...tags, newTag];
                                      await api.setTags(p.id, next).catch(() => {});
                                      setAddTagProfileId(null);
                                      setAddTagInput("");
                                      if (target) loadProfiles(target.url);
                                      loadTags();
                                    }}
                                  >
                                    <input
                                      autoFocus
                                      className="input"
                                      style={{ width: 90, padding: "2px 6px", fontSize: 11, height: 22 }}
                                      placeholder="tag name"
                                      value={addTagInput}
                                      onChange={(e) => setAddTagInput(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          setAddTagProfileId(null);
                                          setAddTagInput("");
                                        }
                                      }}
                                    />
                                    <button type="submit" className="btn btn-primary btn-sm" style={{ padding: "2px 6px", fontSize: 11, height: 22 }}>Add</button>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      style={{ padding: "2px 6px", fontSize: 11, height: 22 }}
                                      onClick={() => { setAddTagProfileId(null); setAddTagInput(""); }}
                                    >
                                      Cancel
                                    </button>
                                  </form>
                                ) : (
                                  <button
                                    title="Add tag"
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: "1px 6px", fontSize: 13, lineHeight: 1, height: 20 }}
                                    onClick={() => { setAddTagProfileId(p.id); setAddTagInput(""); }}
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <Link to={`/profiles/${p.id}`} className="btn btn-primary btn-sm">View</Link>
                                <button
                                  className={`btn btn-sm ${isCompareBase ? "btn-primary" : "btn-secondary"}`}
                                  onClick={() => setCompareBaseProfile(isCompareBase ? null : p)}
                                >
                                  {isCompareBase ? "Comparing..." : "Compare"}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => api.exportProfile(p.id)}>Export</button>
                                <button className="btn btn-danger btn-sm" onClick={() => deleteProfile(p.id)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {compareBaseProfile && (
                  <CompareSelector
                    base={compareBaseProfile}
                    targetURL={target.url}
                    onClose={() => setCompareBaseProfile(null)}
                    onNavigate={(baseId, compareId) => navigate(`/profiles/diff?base=${baseId}&compare=${compareId}`)}
                  />
                )}
              </>
            ) : (
              <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
                No profiles collected yet.{target.status === "connected" ? " Use the controls above to start profiling." : " Reconnect to collect new profiles."}
              </div>
            )}
          </div>
        </>
      )}

      {/* Monitor tab */}
      {tab === "monitor" && target.status === "connected" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Window:</span>
            {[
              { label: "1m", minutes: 1 },
              { label: "5m", minutes: 5 },
              { label: "15m", minutes: 15 },
              { label: "30m", minutes: 30 },
              { label: "1h", minutes: 60 },
              { label: "2h", minutes: 120 },
            ].map((opt) => (
              <button
                key={opt.minutes}
                className={`btn btn-sm ${monitorWindow === opt.minutes ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setMonitorWindow(opt.minutes)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Java monitoring */}
          {target.language === "java" && (
            <JavaMonitorCharts targetId={target.id} active={tab === "monitor"} windowMs={monitorWindow * 60 * 1000} />
          )}

          {/* Go monitoring */}
          {(target.language === "go" || !target.language) && (<>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Memory</h2>
            <MemoryChart targetId={target.id} active={tab === "monitor"} windowMs={monitorWindow * 60 * 1000} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Goroutines</h2>
            <GoroutineChart targetId={target.id} active={tab === "monitor"} windowMs={monitorWindow * 60 * 1000} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>CPU</h2>
              <button
                className={`btn btn-sm ${cpuEnabled ? "btn-danger" : "btn-primary"}`}
                disabled={cpuToggling}
                onClick={async () => {
                  setCpuToggling(true);
                  try {
                    if (cpuEnabled) {
                      await api.disableCpuMonitoring(target.id);
                      setCpuEnabled(false);
                    } else {
                      await api.enableCpuMonitoring(target.id);
                      setCpuEnabled(true);
                    }
                  } catch { /* ignore */ }
                  setCpuToggling(false);
                }}
              >
                {cpuToggling ? "..." : cpuEnabled ? "Disable" : "Enable"}
              </button>
              {!cpuEnabled && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  CPU profiling adds overhead to the target process
                </span>
              )}
            </div>
            {cpuEnabled && (
              <CpuChart targetId={target.id} active={tab === "monitor" && cpuEnabled} windowMs={monitorWindow * 60 * 1000} />
            )}
          </div>
          </>)}
        </div>
      )}

      {tab === "info" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Connection management */}
        <div className="card">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Connection</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {target.status === "connected" && (
              <button className="btn btn-secondary btn-sm" onClick={disconnect}>Disconnect</button>
            )}
            {target.status === "saved" && (
              <button className="btn btn-primary btn-sm" onClick={reconnect}>Reconnect</button>
            )}
            {target.status === "unreachable" && (
              <>
                <button className="btn btn-primary btn-sm" onClick={reconnect}>Reconnect</button>
                <button className="btn btn-secondary btn-sm" onClick={disconnect}>Disconnect</button>
              </>
            )}
            {target.status === "saved" && (
              <button className="btn btn-danger btn-sm" onClick={() => {
                if (confirm("Remove this connection permanently?")) remove();
              }}>Delete</button>
            )}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>Status: <strong style={{ color: target.status === "connected" ? "var(--success)" : target.status === "unreachable" ? "var(--danger)" : "var(--text-muted)" }}>{target.status}</strong></span>
            <span style={{ color: "var(--text-muted)" }}>URL: <span className="mono">{target.url}</span></span>
          </div>
        </div>

        {isWails() && (
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Source Directory</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={sourceDir}
                onChange={(e) => setSourceDir(e.target.value)}
                onBlur={() => { if (id) api.setSourceDir(id, sourceDir).catch(() => {}); }}
                placeholder="Path to Go source directory..."
                className="input"
                style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 13 }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  try {
                    const dir = await api.browseSourceDir();
                    if (dir) {
                      setSourceDir(dir);
                      if (id) await api.setSourceDir(id, dir);
                    }
                  } catch { /* ignore */ }
                }}
              >
                Browse
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Used by AI analysis to read source code for flame graph explanations</p>
          </div>
        )}
        <div className="card">
          {processInfo ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {processInfo.cmdline && processInfo.cmdline.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Command Line</h3>
                  <div className="code-block"><pre><code>{processInfo.cmdline.join(" ")}</code></pre></div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {processInfo.goVersion && (
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Go Version</h3>
                    <span className="mono" style={{ fontSize: 14 }}>{processInfo.goVersion}</span>
                  </div>
                )}
                {processInfo.goos && (
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>OS</h3>
                    <span className="mono" style={{ fontSize: 14 }}>{processInfo.goos}</span>
                  </div>
                )}
                {processInfo.goarch && (
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Architecture</h3>
                    <span className="mono" style={{ fontSize: 14 }}>{processInfo.goarch}</span>
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Target URL</h3>
                  <span className="mono" style={{ fontSize: 14 }}>{target.url}</span>
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>Loading process information...</p>
          )}
        </div>
        </div>
      )}

      {tab === "expvars" && target.status === "connected" && (
        <ExpvarMetrics targetId={target.id} active={tab === "expvars"} />
      )}
    </div>
  );
}

const WELL_KNOWN = new Set(["cpu", "trace", "heap", "goroutine", "block", "mutex", "allocs", "threadcreate", "lock"]);

function ProfilingControls({ targetId, language, onComplete }: { targetId: string; language: Language; onComplete: (profileId?: string) => void }) {
  const [profileType, setProfileType] = useState<ProfileType>("cpu");
  const [duration, setDuration] = useState(30);
  const [profiling, setProfiling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [available, setAvailable] = useState<AvailableProfile[] | null>(null);

  useEffect(() => {
    if (language === "java") {
      // Java targets don't have pprof — provide Java profile types directly
      setAvailable([
        { name: "cpu", kind: "recording" },
        { name: "heap", kind: "snapshot" },
        { name: "allocs", kind: "recording" },
        { name: "lock", kind: "recording" },
      ]);
    } else {
      api.getAvailableProfiles(targetId).then(setAvailable).catch(() => setAvailable(null));
    }
  }, [targetId, language]);

  const recordings = available ? available.filter((p) => p.kind === "recording") : [{ name: "cpu", kind: "recording" as const }, { name: "trace", kind: "recording" as const }];
  const snapshots = available ? available.filter((p) => p.kind === "snapshot" && WELL_KNOWN.has(p.name)) : [{ name: "heap", kind: "snapshot" as const }, { name: "goroutine", kind: "snapshot" as const }, { name: "block", kind: "snapshot" as const }, { name: "mutex", kind: "snapshot" as const }, { name: "allocs", kind: "snapshot" as const }, { name: "threadcreate", kind: "snapshot" as const }];
  const custom = available ? available.filter((p) => p.kind === "snapshot" && !WELL_KNOWN.has(p.name)) : [];

  const isRecording = recordings.some((r) => r.name === profileType);

  const cleanup = () => {
    setProfiling(false);
    setProgress(0);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startProfile = async () => {
    setProfiling(true);
    setError("");
    setProgress(0);

    if (isRecording) {
      // Start async recording
      const startTime = Date.now();
      const totalMs = duration * 1000;
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setProgress(Math.min(elapsed / totalMs, 0.99));
      }, 200);

      try {
        const req: StartProfileRequest = { type: profileType, durationSec: duration };
        await api.startProfile(targetId, req);

        // Poll for completion
        pollRef.current = setInterval(async () => {
          try {
            const status = await api.getRecordingStatus(targetId);
            if (status.status === "done") {
              cleanup();
              onComplete(status.profileId);
            } else if (status.status === "failed") {
              cleanup();
              setError(status.error || "Recording failed");
            } else if (status.status === "idle") {
              // Recording finished between polls
              cleanup();
            }
          } catch {}
        }, 1000);
      } catch (e: any) {
        cleanup();
        setError(e.message || "Failed to start recording");
      }
    } else {
      // Snapshot — may be sync (Go) or async (Java JFR)
      try {
        const req: StartProfileRequest = { type: profileType };
        const result = await api.startProfile(targetId, req);

        if ((result as any)?.status === "recording") {
          // Java JFR snapshot — poll for completion like a recording
          pollRef.current = setInterval(async () => {
            try {
              const status = await api.getRecordingStatus(targetId);
              if (status.status === "done") {
                cleanup();
                onComplete(status.profileId);
              } else if (status.status === "failed") {
                cleanup();
                setError(status.error || "Capture failed");
              } else if (status.status === "idle") {
                cleanup();
              }
            } catch {}
          }, 500);
        } else {
          cleanup();
          if (profileType === "all_snapshots") {
            onComplete();
          } else {
            const profileId = (result as any)?.id || (result as any)?.profile?.id;
            onComplete(profileId);
          }
        }
      } catch (e: any) {
        cleanup();
        setError(e.message || "Capture failed");
      }
    }
  };


  const cancelProfile = async () => {
    try { await api.cancelProfile(targetId); } catch {}
    cleanup();
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
          {recordings.map((p) => (
            <button
              key={p.name}
              className={`btn btn-sm ${profileType === p.name ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setProfileType(p.name as ProfileType)}
              disabled={profiling}
            >{profileLabel(p.name)}</button>
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
          {snapshots.map((p) => (
            <button
              key={p.name}
              className={`btn btn-sm ${profileType === p.name ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setProfileType(p.name as ProfileType)}
              disabled={profiling}
            >{profileLabel(p.name)}</button>
          ))}
          <button
            className={`btn btn-sm ${profileType === "all_snapshots" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setProfileType("all_snapshots")}
            disabled={profiling}
          >All</button>
        </div>

        {custom.length > 0 && (
          <>
            <span style={{ color: "var(--border)", fontSize: 18 }}>|</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Custom
              </span>
              {custom.map((p) => (
                <button
                  key={p.name}
                  className={`btn btn-sm ${profileType === p.name ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setProfileType(p.name as ProfileType)}
                  disabled={profiling}
                >{p.name}{p.count != null ? ` (${p.count})` : ""}</button>
              ))}
            </div>
          </>
        )}

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
            <span>Recording {profileType === "trace" ? "execution trace" : "CPU profile"}...</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {profiling && !isRecording && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-block", width: 14, height: 14,
            boxSizing: "border-box",
            border: "2px solid var(--border)",
            borderTopColor: "var(--accent, #8b5cf6)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          Capturing {profileType === "all_snapshots" ? "all snapshots" : `${profileType} profile`}...
        </div>
      )}

      {error && <p style={{ color: "var(--danger)", marginTop: 8, fontSize: 13 }}>{error}</p>}
    </div>
  );
}

const PROFILE_LABELS: Record<string, string> = {
  cpu: "CPU", trace: "Trace", heap: "Heap", goroutine: "Goroutine",
  block: "Block", mutex: "Mutex", allocs: "Allocs", threadcreate: "Threads",
  lock: "Lock",
};
function profileLabel(name: string): string {
  return PROFILE_LABELS[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function CompareSelector({
  base,
  targetURL,
  onClose,
  onNavigate,
}: {
  base: ProfileMeta;
  targetURL: string;
  onClose: () => void;
  onNavigate: (baseId: string, compareId: string) => void;
}) {
  const [candidateTagFilter, setCandidateTagFilter] = useState("");
  const [candidateTags, setCandidateTags] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ProfileMeta[]>([]);

  useEffect(() => {
    api.listTags().then(setCandidateTags).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .listProfiles({ target: targetURL, type: base.type, tag: candidateTagFilter || undefined })
      .then((all) => setCandidates(all.filter((p) => p.id !== base.id)))
      .catch(() => {});
  }, [targetURL, base.type, base.id, candidateTagFilter]);

  return (
    <div
      className="card"
      style={{
        marginTop: 12,
        border: "1px solid rgba(99,102,241,0.4)",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          Compare: select a profile to compare against
        </span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>

      <div
        style={{
          padding: "8px 12px",
          marginBottom: 12,
          borderRadius: 6,
          background: "rgba(99,102,241,0.1)",
          border: "1px solid rgba(99,102,241,0.25)",
          fontSize: 13,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Base:</span>
        <ProfileTypeBadge type={base.type} />
        <span className="mono" style={{ fontSize: 12 }}>{new Date(base.timestamp).toLocaleString()}</span>
        {parseTags(base.tags).map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
              background: "rgba(99,102,241,0.18)",
              color: "var(--accent)",
              border: "1px solid rgba(99,102,241,0.3)",
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {candidateTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Filter by tag:</span>
          <button
            className={`btn btn-sm ${candidateTagFilter === "" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setCandidateTagFilter("")}
          >
            All
          </button>
          {candidateTags.map((tag) => (
            <button
              key={tag}
              className={`btn btn-sm ${candidateTagFilter === tag ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setCandidateTagFilter(candidateTagFilter === tag ? "" : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {candidates.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          No other {base.type} profiles available{candidateTagFilter ? ` with tag "${candidateTagFilter}"` : ""}.
        </p>
      ) : (
        <div style={{ maxHeight: 260, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Duration</th>
                <th>Size</th>
                <th>Tags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => onNavigate(base.id, c.id)}>
                  <td className="mono" style={{ fontSize: 12 }}>{new Date(c.timestamp).toLocaleString()}</td>
                  <td>{c.durationSec ? `${c.durationSec}s` : "instant"}</td>
                  <td>{formatBytes(c.size)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {parseTags(c.tags).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(99,102,241,0.18)",
                            color: "var(--accent)",
                            border: "1px solid rgba(99,102,241,0.3)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={(e) => { e.stopPropagation(); onNavigate(base.id, c.id); }}
                    >
                      Diff
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
