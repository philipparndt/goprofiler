const BASE = "/api";

export interface Target {
  id: string;
  url: string;
  status: "connected" | "unreachable" | "saved";
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
  type: "cpu" | "trace" | "heap" | "goroutine" | "block" | "mutex" | "allocs" | "threadcreate" | "all_snapshots";
  durationSec?: number;
}

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

export const api = {
  listTargets: () => request<Target[]>("/targets"),
  connect: (url: string) => request<Target>("/targets", { method: "POST", body: JSON.stringify({ url }) }),
  disconnect: (id: string) => request<void>(`/targets/${id}`, { method: "DELETE" }),

  listSavedTargets: () => request<Target[]>("/targets/saved"),
  reconnect: (id: string) => request<Target>(`/targets/saved/${id}/reconnect`, { method: "POST" }),
  removeSavedTarget: (id: string) => request<void>(`/targets/saved/${id}`, { method: "DELETE" }),

  startProfile: (targetId: string, req: StartProfileRequest) =>
    request<ProfileMeta>(`/targets/${targetId}/profiles`, { method: "POST", body: JSON.stringify(req) }),
  cancelProfile: (targetId: string) =>
    request<void>(`/targets/${targetId}/profiles/active`, { method: "DELETE" }),
  getRecordingStatus: (targetId: string) =>
    request<{ status: string; profileId?: string; error?: string; type?: string }>(`/targets/${targetId}/profiles/active`),
  stopRecording: (targetId: string) =>
    request<{ status: string; profileId?: string; error?: string }>(`/targets/${targetId}/profiles/stop`, { method: "POST" }),

  listProfiles: (opts?: { type?: string; target?: string; tag?: string }) => {
    const params = new URLSearchParams();
    if (opts?.type) params.set("type", opts.type);
    if (opts?.target) params.set("target", opts.target);
    if (opts?.tag) params.set("tag", opts.tag);
    const qs = params.toString();
    return request<ProfileMeta[]>(`/profiles${qs ? `?${qs}` : ""}`);
  },
  getProfile: (id: string, opts?: { filter?: string; valueMode?: string }) => {
    const params = new URLSearchParams();
    if (opts?.filter) params.set("filter", opts.filter);
    if (opts?.valueMode) params.set("valueMode", opts.valueMode);
    const qs = params.toString();
    return request<ProfileDetail>(`/profiles/${id}${qs ? `?${qs}` : ""}`);
  },
  deleteProfile: (id: string) => request<void>(`/profiles/${id}`, { method: "DELETE" }),
  refreshProfile: (id: string) => request<ProfileMeta>(`/profiles/${id}/refresh`, { method: "POST" }),
  updateLabel: (id: string, label: string) =>
    request<void>(`/profiles/${id}/label`, { method: "PUT", body: JSON.stringify({ label }) }),
  exportProfile: (id: string) => {
    window.open(`${BASE}/profiles/${id}/raw`, "_blank");
  },

  diffProfiles: (baseId: string, compareId: string) =>
    request<ProfileDetail>(`/profiles/diff?base=${baseId}&compare=${compareId}`),

  setTags: (id: string, tags: string[]) =>
    request<void>(`/profiles/${id}/tags`, { method: "PUT", body: JSON.stringify({ tags }) }),
  listTags: () => request<string[]>("/tags"),

  getProcessInfo: (targetId: string) => request<ProcessInfo>(`/targets/${targetId}/process-info`),
  getAvailableProfiles: (targetId: string) => request<AvailableProfile[]>(`/targets/${targetId}/profiles/available`),
  getExpvars: (targetId: string) => request<{ timestamp: string; metrics: Record<string, any> }>(`/targets/${targetId}/expvars`),
  getTraceData: (profileId: string) => request<TraceData>(`/profiles/${profileId}/trace-data`),
  getGoroutineGroups: (targetId: string, top?: number) =>
    request<GoroutineGroupsResponse>(`/targets/${targetId}/goroutine-groups${top ? `?top=${top}` : ""}`),

  getMemStatsHistory: (targetId: string, since?: string) => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    return request<MemStatsHistory>(`/targets/${targetId}/memstats/history${qs}`);
  },
};

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
