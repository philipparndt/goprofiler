import { EventsOn } from "./wailsjs/runtime/runtime";

const BASE = "/api";

/**
 * logFrontend mirrors a message into the Go logger so it lands in
 * ~/.goprofiler/app.log alongside backend logs. In browser mode it just falls
 * back to the console.
 */
export function logFrontend(level: "info" | "warn" | "error" | "debug", msg: string): void {
  if (isWails()) {
    try { wailsCall("LogFrontend", level, msg); } catch { /* ignore */ }
  }
  // Always mirror to the dev console too — harmless in production.
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${level}] ${msg}`);
}

export type Language = "go" | "java";

export interface Target {
  id: string;
  url: string;
  status: "connected" | "unreachable" | "saved";
  language: Language;
  connectionMethod?: string; // "pprof", "jmx", "async-profiler"
  lastCheck?: string;
  lastConnected?: string;
  label?: string;
  profileCount?: number;
}

export interface ProfileMeta {
  id: string;
  targetURL: string;
  type: string;
  timestamp: string;
  durationSec?: number;
  size: number;
  label?: string;
  tags?: string;
}

export interface FlameNode {
  name: string;
  value: number;
  samples: number;
  children?: FlameNode[];
}

export interface TopFunction {
  name: string;
  flat: string;
  flatPercent: number;
  cum: string;
  cumPercent: number;
  allocFlat?: string;
  allocFlatPercent?: number;
  allocCum?: string;
  allocCumPercent?: number;
}

export interface CallTreeNode {
  name: string;
  self: number;
  selfFmt: string;
  selfPct: number;
  cum: number;
  cumFmt: string;
  cumPct: number;
  /** Number of samples where this function appeared at this call position (not exact invocation count) */
  calls: number;
  allocSelf?: number;
  allocSelfFmt?: string;
  allocCum?: number;
  allocCumFmt?: string;
  children?: CallTreeNode[];
}

export interface ProfileDetail extends ProfileMeta {
  flameGraph: FlameNode;
  topFunctions: TopFunction[];
  callTree: CallTreeNode;
}

export interface StartProfileRequest {
  type: "cpu" | "trace" | "heap" | "goroutine" | "block" | "mutex" | "allocs" | "threadcreate" | "all_snapshots" | "lock";
  durationSec?: number;
}

// Runtime detection: Wails injects window.go at startup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isWails(): boolean {
  return !!(window as any).go;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wailsCall(method: string, ...args: any[]): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).go.main.App[method](...args);
}

// --- HTTP (browser) mode ---

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

// --- API object (dispatches to HTTP or Wails) ---

export const api = {
  listTargets: (): Promise<Target[]> =>
    isWails() ? wailsCall("ListTargets") : request<Target[]>("/targets"),

  connect: (url: string): Promise<Target> =>
    isWails() ? wailsCall("AddTarget", url) : request<Target>("/targets", { method: "POST", body: JSON.stringify({ url }) }),

  connectJava: (address: string): Promise<Target> =>
    wailsCall("AddJavaTarget", address),

  discoverLocalJVMs: (): Promise<{ pid: number; mainClass: string; args?: string; jmxPort?: number; asprofAvailable?: boolean }[]> =>
    wailsCall("DiscoverLocalJVMs"),

  connectLocalJVM: (pid: number): Promise<Target> =>
    wailsCall("ConnectLocalJVM", pid),

  discoverK8s: (context?: string, namespace?: string, search?: string): Promise<{
    currentContext: string;
    contexts: { name: string; cluster: string; namespace: string; isCurrent: boolean }[];
    namespaces: string[];
    pods: { name: string; namespace: string; status: string; age: string; language: string; containers: { name: string; image: string; profilingPort?: number }[]; labels?: Record<string, string> }[];
  }> =>
    isWails()
      ? wailsCall("DiscoverK8s", context ?? "", namespace ?? "", search ?? "")
      : request(`/k8s/discover?context=${encodeURIComponent(context ?? "")}&namespace=${encodeURIComponent(namespace ?? "")}&search=${encodeURIComponent(search ?? "")}`),

  listK8sContexts: (): Promise<{ name: string; cluster: string; namespace: string; isCurrent: boolean }[]> =>
    isWails() ? wailsCall("ListK8sContexts") : request(`/k8s/contexts`),

  listK8sNamespaces: (context: string): Promise<string[]> =>
    isWails() ? wailsCall("ListK8sNamespaces", context) : request(`/k8s/namespaces?context=${encodeURIComponent(context)}`),

  listK8sPods: (context: string, namespace: string, search: string): Promise<{ name: string; namespace: string; status: string; age: string; language: string; containers: { name: string; image: string; profilingPort?: number }[]; labels?: Record<string, string> }[]> =>
    isWails() ? wailsCall("ListK8sPods", context, namespace, search) : request(`/k8s/pods?context=${encodeURIComponent(context)}&namespace=${encodeURIComponent(namespace)}&search=${encodeURIComponent(search)}`),

  connectK8sPod: (context: string, namespace: string, podName: string, port: number, language: string): Promise<Target> =>
    isWails() ? wailsCall("ConnectK8sPod", context, namespace, podName, port, language) : request(`/k8s/connect`, { method: "POST", body: JSON.stringify({ context, namespace, pod: podName, port, language }) }),

  disconnect: (id: string): Promise<void> =>
    isWails() ? wailsCall("DisconnectTarget", id) : request<void>(`/targets/${id}`, { method: "DELETE" }),

  listSavedTargets: (): Promise<Target[]> =>
    isWails() ? wailsCall("ListSavedTargets") : request<Target[]>("/targets/saved"),

  reconnect: (id: string): Promise<Target> =>
    isWails() ? wailsCall("ReconnectTarget", id) : request<Target>(`/targets/saved/${id}/reconnect`, { method: "POST" }),

  removeSavedTarget: (id: string): Promise<void> =>
    isWails() ? wailsCall("RemoveTarget", id) : request<void>(`/targets/saved/${id}`, { method: "DELETE" }),

  startProfile: (targetId: string, req: StartProfileRequest): Promise<ProfileMeta> =>
    isWails()
      ? wailsCall("StartProfile", targetId, req.type, req.durationSec ?? 30)
      : request<ProfileMeta>(`/targets/${targetId}/profiles`, { method: "POST", body: JSON.stringify(req) }),

  cancelProfile: (targetId: string): Promise<void> =>
    isWails()
      ? wailsCall("CancelProfile", targetId)
      : request<void>(`/targets/${targetId}/profiles/active`, { method: "DELETE" }),

  getRecordingStatus: (targetId: string): Promise<{ status: string; profileId?: string; error?: string; type?: string }> =>
    isWails()
      ? wailsCall("GetRecordingStatus", targetId)
      : request<{ status: string; profileId?: string; error?: string; type?: string }>(`/targets/${targetId}/profiles/active`),

  stopRecording: (targetId: string): Promise<{ status: string; profileId?: string; error?: string }> =>
    isWails()
      ? wailsCall("StopRecording", targetId)
      : request<{ status: string; profileId?: string; error?: string }>(`/targets/${targetId}/profiles/stop`, { method: "POST" }),

  listProfiles: (opts?: { type?: string; target?: string; tag?: string }): Promise<ProfileMeta[]> => {
    if (isWails()) {
      return wailsCall("ListProfiles", opts?.type ?? "", opts?.target ?? "", opts?.tag ?? "");
    }
    const params = new URLSearchParams();
    if (opts?.type) params.set("type", opts.type);
    if (opts?.target) params.set("target", opts.target);
    if (opts?.tag) params.set("tag", opts.tag);
    const qs = params.toString();
    return request<ProfileMeta[]>(`/profiles${qs ? `?${qs}` : ""}`);
  },

  getProfile: (id: string, opts?: { filter?: string; valueMode?: string }): Promise<ProfileDetail> => {
    if (isWails()) {
      return wailsCall("GetProfile", id, opts?.filter ?? "", opts?.valueMode ?? "");
    }
    const params = new URLSearchParams();
    if (opts?.filter) params.set("filter", opts.filter);
    if (opts?.valueMode) params.set("valueMode", opts.valueMode);
    const qs = params.toString();
    return request<ProfileDetail>(`/profiles/${id}${qs ? `?${qs}` : ""}`);
  },

  deleteProfile: (id: string): Promise<void> =>
    isWails() ? wailsCall("DeleteProfile", id) : request<void>(`/profiles/${id}`, { method: "DELETE" }),

  refreshProfile: (id: string): Promise<ProfileMeta> =>
    isWails() ? wailsCall("RefreshProfile", id) : request<ProfileMeta>(`/profiles/${id}/refresh`, { method: "POST" }),

  updateLabel: (id: string, label: string): Promise<void> =>
    isWails()
      ? wailsCall("UpdateLabel", id, label)
      : request<void>(`/profiles/${id}/label`, { method: "PUT", body: JSON.stringify({ label }) }),

  exportProfile: (id: string): void => {
    if (isWails()) {
      // Use the native SaveFileDialog: bypass the Blob + <a>.click() path,
      // which is flaky inside WKWebView and hides errors with no devtools.
      wailsCall("ExportProfileToFile", id)
        .then((path: string) => {
          if (path) logFrontend("info", `profile exported to ${path}`);
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          logFrontend("error", `exportProfile failed: ${msg}`);
        });
    } else {
      window.open(`${BASE}/profiles/${id}/raw`, "_blank");
    }
  },

  diffProfiles: (baseId: string, compareId: string): Promise<ProfileDetail> =>
    isWails()
      ? wailsCall("DiffProfiles", baseId, compareId)
      : request<ProfileDetail>(`/profiles/diff?base=${baseId}&compare=${compareId}`),

  setTags: (id: string, tags: string[]): Promise<void> =>
    isWails()
      ? wailsCall("SetTags", id, tags)
      : request<void>(`/profiles/${id}/tags`, { method: "PUT", body: JSON.stringify({ tags }) }),

  listTags: (): Promise<string[]> =>
    isWails() ? wailsCall("ListTags") : request<string[]>("/tags"),

  getProcessInfo: (targetId: string): Promise<ProcessInfo> =>
    isWails() ? wailsCall("GetProcessInfo", targetId) : request<ProcessInfo>(`/targets/${targetId}/process-info`),

  getSourceDir: (targetId: string): Promise<string> =>
    isWails()
      ? wailsCall("GetSourceDir", targetId)
      : request<{ sourceDir: string }>(`/targets/${targetId}/source-dir`).then((r) => r.sourceDir),

  setSourceDir: (targetId: string, path: string): Promise<void> =>
    isWails()
      ? wailsCall("SetSourceDir", targetId, path)
      : request<void>(`/targets/${targetId}/source-dir`, { method: "PUT", body: JSON.stringify({ sourceDir: path }) }),

  // Browse dialog only works in Wails — web mode intentionally has no HTTP
  // endpoint for filesystem browsing; users paste the path instead.
  browseSourceDir: (): Promise<string> =>
    wailsCall("BrowseSourceDir"),

  checkClaudeAvailable: async (): Promise<boolean> => {
    if (isWails()) return wailsCall("CheckClaudeAvailable");
    const providers = await api.getAvailableAIProviders();
    return providers.some((p) => p.available);
  },

  startAnalysis: (req: AnalysisRequest): Promise<{ streamId?: string }> =>
    isWails()
      ? wailsCall("StartAnalysis", req).then(() => ({}))
      : request<{ streamId: string }>(`/ai/analyze`, { method: "POST", body: JSON.stringify(req) }),

  cancelAnalysis: (): Promise<void> =>
    isWails() ? wailsCall("CancelAnalysis") : request<void>(`/ai/cancel`, { method: "POST" }),

  startTraceAnalysis: (req: TraceAnalysisRequest): Promise<{ streamId?: string }> =>
    isWails()
      ? wailsCall("StartTraceAnalysis", req).then(() => ({}))
      : request<{ streamId: string }>(`/ai/trace-analyze`, { method: "POST", body: JSON.stringify(req) }),

  followUpAnalysis: (req: { targetUrl: string; message: string; permissionLevel?: string }): Promise<{ streamId?: string }> =>
    isWails()
      ? wailsCall("FollowUpAnalysis", req).then(() => ({}))
      : request<{ streamId: string }>(`/ai/follow-up`, { method: "POST", body: JSON.stringify(req) }),

  getSettings: (): Promise<Record<string, string>> =>
    wailsCall("GetSettings"),

  updateSettings: (settings: Record<string, string>): Promise<void> =>
    wailsCall("UpdateSettings", settings),

  getAvailableAIProviders: (): Promise<{ id: string; name: string; available: boolean; active?: boolean }[]> =>
    isWails()
      ? wailsCall("GetAvailableAIProviders")
      : request<{ id: string; name: string; available: boolean; active?: boolean }[]>(`/ai/providers`),

  getAvailableProfiles: (targetId: string): Promise<AvailableProfile[]> =>
    isWails() ? wailsCall("GetAvailableProfiles", targetId) : request<AvailableProfile[]>(`/targets/${targetId}/profiles/available`),

  getExpvars: (targetId: string): Promise<{ timestamp: string; metrics: Record<string, any> }> =>
    isWails() ? wailsCall("GetExpvars", targetId) : request<{ timestamp: string; metrics: Record<string, any> }>(`/targets/${targetId}/expvars`),

  getTraceData: (profileId: string): Promise<TraceData> =>
    isWails() ? wailsCall("GetTraceData", profileId) : request<TraceData>(`/profiles/${profileId}/trace-data`),

  getGoroutineGroups: (targetId: string, top?: number): Promise<GoroutineGroupsResponse> =>
    isWails()
      ? wailsCall("GetGoroutineGroups", targetId, top ?? 20)
      : request<GoroutineGroupsResponse>(`/targets/${targetId}/goroutine-groups${top ? `?top=${top}` : ""}`),

  getMemStatsHistory: (targetId: string, since?: string): Promise<MemStatsHistory> => {
    if (isWails()) {
      return wailsCall("GetMemStatsHistory", targetId, since ?? "");
    }
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    return request<MemStatsHistory>(`/targets/${targetId}/memstats/history${qs}`);
  },

  getCpuHistory: (targetId: string, since?: string): Promise<CpuHistoryResponse> => {
    if (isWails()) {
      return wailsCall("GetCpuHistory", targetId, since ?? "");
    }
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    return request<CpuHistoryResponse>(`/targets/${targetId}/cpu/history${qs}`);
  },

  enableCpuMonitoring: (targetId: string): Promise<{ status: string }> =>
    isWails() ? wailsCall("EnableCpuMonitoring", targetId) : request<{ status: string }>(`/targets/${targetId}/cpu/enable`, { method: "POST" }),

  getJavaMonitorHistory: (targetId: string, since?: string): Promise<JavaMonitorHistory> => {
    if (isWails()) {
      return wailsCall("GetJavaMonitorHistory", targetId, since ?? "");
    }
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    return request<JavaMonitorHistory>(`/targets/${targetId}/java/monitor/history${qs}`);
  },

  enableJavaMonitoring: (targetId: string): Promise<{ status: string }> =>
    wailsCall("EnableJavaMonitoring", targetId),

  disableJavaMonitoring: (targetId: string): Promise<{ status: string }> =>
    wailsCall("DisableJavaMonitoring", targetId),

  disableCpuMonitoring: (targetId: string): Promise<{ status: string }> =>
    isWails() ? wailsCall("DisableCpuMonitoring", targetId) : request<{ status: string }>(`/targets/${targetId}/cpu/disable`, { method: "POST" }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AIEvent = any;

/**
 * subscribeAIEvents wires up an AI event stream for both runtimes. In Wails
 * mode, `streamId` is ignored and events arrive via the global event bus. In
 * web mode, a `streamId` must be passed and an EventSource is opened against
 * `/api/ai/stream/{streamId}`. Returns a cleanup function that must be called
 * when the consumer unmounts or switches streams.
 */
export function subscribeAIEvents(
  streamId: string | undefined,
  onEvent: (evt: AIEvent) => void,
  onDone: () => void,
): () => void {
  if (isWails()) {
    const offEvent = EventsOn("ai:event", onEvent);
    const offDone = EventsOn("ai:done", onDone);
    return () => { offEvent(); offDone(); };
  }
  if (!streamId) {
    // No way to subscribe — return a no-op cleanup.
    return () => {};
  }
  const es = new EventSource(`${BASE}/ai/stream/${encodeURIComponent(streamId)}`);
  es.addEventListener("ai:event", (e) => {
    try { onEvent(JSON.parse((e as MessageEvent).data)); } catch { /* ignore */ }
  });
  es.addEventListener("ai:done", () => {
    onDone();
    es.close();
  });
  es.onerror = () => {
    // Browser will auto-reconnect; if the stream is gone, the server returns
    // 404 and we fire onDone so the UI unblocks.
    onDone();
    es.close();
  };
  return () => es.close();
}

export interface TraceData {
  meta: { durationNs: number; goroutineCount: number; processorCount: number; gcCount: number };
  goroutines: { id: number; name: string; spans: { start: number; end: number; state: string; reason?: string; processor?: number; stack?: string[] }[] }[];
  gcEvents: { start: number; end: number; pauseNs: number }[];
  processors: { id: number; spans: { start: number; end: number; goroutineId: number }[] }[];
  blockingSummary: { location: string; category: string; totalDuration: number; count: number; stack?: string[] }[];
}

export interface GoroutineGroupsResponse {
  total: number;
  groups: { count: number; state: string; topFrame: string; location: string; stack: string }[];
}

export interface AvailableProfile {
  name: string;
  count?: number;
  kind: "recording" | "snapshot";
}

export interface ProcessInfo {
  cmdline: string[];
  goVersion?: string;
  goos?: string;
  goarch?: string;
}

export interface MemStatsDataPoint {
  timestamp: string;
  heapAlloc: number;
  heapSys: number;
  sys: number;
  numGC: number;
  pauseTotalNs: number;
  lastPauseNs: number;
  numGoroutines: number;
}

export interface MemStatsGCEvent {
  timestamp: string;
  pauseNs: number;
  gcNum: number;
}

export interface MemStatsHistory {
  points: MemStatsDataPoint[];
  gcEvents: MemStatsGCEvent[];
}

export interface AnalysisFunction {
  Name: string;
  Flat: string;
  FlatPct: number;
  Cum: string;
  CumPct: number;
}

export interface AnalysisRequest {
  targetId: string;
  profileId: string;
  mode: "explain" | "optimize" | "explain-function";
  profileType?: string;
  functionName?: string;
  functions?: AnalysisFunction[];
  permissionLevel?: "read-only" | "edit-files";
}

export interface TraceAnalysisRequest {
  targetUrl: string;
  profileId: string;
  mode: "trace-overview" | "trace-goroutine" | "trace-blocking" | "trace-span" | "trace-gc" | "trace-goroutines-tab" | "trace-blocking-tab";
  goroutineId?: number;
  blockingIdx?: number;
  span?: { state: string; start: number; end: number; reason?: string; stack?: string[] };
  goroutineName?: string;
  adjacentSpans?: { state: string; start: number; end: number; reason?: string; stack?: string[] }[];
}

export interface JavaMonitorDataPoint {
  timestamp: string;
  heapUsed: number;
  heapCommitted: number;
  heapMax: number;
  cpuPercent: number;
  threadCount: number;
  threadPeak: number;
  gcCount: number;
  gcTimeMs: number;
}

export interface JavaMonitorHistory {
  points: JavaMonitorDataPoint[];
}

export interface CpuDataPoint {
  timestamp: string;
  cpuPercent: number;
}

export interface CpuHistoryResponse {
  points: CpuDataPoint[];
  active: boolean;
}
