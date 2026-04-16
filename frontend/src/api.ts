const BASE = "/api";

export interface Target {
  id: string;
  url: string;
  status: "connected" | "unreachable" | "saved";
  lastCheck?: string;
  lastConnected?: string;
  label?: string;
}

export interface ProfileMeta {
  id: string;
  targetURL: string;
  type: string;
  timestamp: string;
  durationSec?: number;
  size: number;
  label?: string;
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
  children?: CallTreeNode[];
}

export interface ProfileDetail extends ProfileMeta {
  flameGraph: FlameNode;
  topFunctions: TopFunction[];
  callTree: CallTreeNode;
}

export interface StartProfileRequest {
  type: "cpu" | "heap" | "goroutine" | "block" | "mutex" | "all_snapshots";
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

  listProfiles: (type?: string) =>
    request<ProfileMeta[]>(`/profiles${type ? `?type=${type}` : ""}`),
  getProfile: (id: string) => request<ProfileDetail>(`/profiles/${id}`),
  deleteProfile: (id: string) => request<void>(`/profiles/${id}`, { method: "DELETE" }),
  updateLabel: (id: string, label: string) =>
    request<void>(`/profiles/${id}/label`, { method: "PUT", body: JSON.stringify({ label }) }),
  exportProfile: (id: string) => {
    window.open(`${BASE}/profiles/${id}/raw`, "_blank");
  },

  diffProfiles: (baseId: string, compareId: string) =>
    request<ProfileDetail>(`/profiles/diff?base=${baseId}&compare=${compareId}`),
};
