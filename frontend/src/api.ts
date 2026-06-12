import type {
  CostScanHistoryItem, CostScanResult, CostSummary, GitCommit, Identity, InfracostSettings,
  LogLevel, LogsResponse, WorkspaceChatMode, WorkspaceChatState, WorkspaceEntry, WorkspaceFile,
} from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(err?.error?.message ?? res.statusText, res.status, err?.error?.code);
  }
  return res.json().catch(() => null) as T;
}

export const api = {
  get: <T>(path: string) => req<T>('GET', path),
  post: <T>(path: string, body: unknown) => req<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => req<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => req<T>('PATCH', path, body),
  delete: <T>(path: string) => req<T>('DELETE', path),
  sendRunInput: (runId: string, value: string) =>
    req<void>('POST', `/api/runs/${encodeURIComponent(runId)}/input`, { value }),
  forceKill: (runId: string) =>
    req<{ status: string }>('POST', `/api/runs/${encodeURIComponent(runId)}/kill`, {}),
};

// ── Shared YAML configuration ─────────────────────────────────────

export const configApi = {
  get:  () => api.get<{ path: string; content: string; revision: string }>('/api/config'),
  save: (content: string, revision: string) =>
    api.put<{ revision: string }>('/api/config', { content, revision }),
};

// ── Profile mappings ──────────────────────────────────────────────

export type ProfileMapping = { dir: string; profile: string };

export const profileMappingsApi = {
  get:  () => api.get<ProfileMapping[]>('/api/profile-mappings'),
  save: (mappings: ProfileMapping[]) =>
    api.put<void>('/api/profile-mappings', mappings),
};

// ── AWS ───────────────────────────────────────────────────────────

export type AWSProfileDetail = { region: string; account_id: string };

export const awsApi = {
  profiles: () => api.get<string[]>('/api/aws/profiles'),
  profileDetails: () => api.get<Record<string, AWSProfileDetail>>('/api/aws/profile-details'),
  identity: (profile?: string) => {
    const qs = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    return api.get<Identity>(`/api/aws/identity${qs}`);
  },
  logout: (profile?: string) => {
    const qs = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    return api.post<{ ok: boolean }>(`/api/aws/sso-logout${qs}`, {});
  },
};

// ── Application logs ──────────────────────────────────────────────

export const logsApi = {
  get: (limit = 500) => api.get<LogsResponse>(`/api/logs?limit=${limit}`),
  setLevel: (level: LogLevel) =>
    api.put<{ level: LogLevel }>('/api/logs/level', { level }),
};

// ── Reports ───────────────────────────────────────────────────────

export const reportsApi = {
  list:   (page = 1, limit = 200) =>
    api.get<import('./types').Paginated<import('./types').Report>>(`/api/reports?page=${page}&limit=${limit}`),
  data:   (name: string) =>
    api.get<import('./types').ReportData>(`/api/reports/${encodeURIComponent(name)}/data`),
  delete: (name: string) =>
    api.delete<void>(`/api/reports?name=${encodeURIComponent(name)}`),
  rawUrl: (name: string) => `/api/reports/${encodeURIComponent(name)}/raw`,
};

// ── Infracost cost estimation ─────────────────────────────────────

export const costApi = {
  settings: () => api.get<InfracostSettings>('/api/infracost/settings'),
  saveSettings: (body: { token?: string | null; enabledByDefault: boolean; currency: string }) =>
    api.put<InfracostSettings>('/api/infracost/settings', body),
  summary: () => api.get<CostSummary>('/api/cost/summary'),
  // Breakdown scans across configured repo targets.
  runScan: () => api.post<CostScanResult>('/api/cost/scan', {}),
  getScan: () => api.get<CostScanResult>('/api/cost/scan'),
  scanHistory: () => api.get<{ items: CostScanHistoryItem[] }>('/api/cost/scans'),
  reportUrl: (format: 'html' | 'text') => `/api/cost/report?format=${format}`,
};

// ── Repo git operations ───────────────────────────────────────────

export const repoGit = {
  branches:   (name: string)                          =>
    api.get<string[]>(`/api/repos/${encodeURIComponent(name)}/branches`),
  commits:    (name: string, base: string, head: string) =>
    api.get<GitCommit[]>(`/api/repos/${encodeURIComponent(name)}/commits?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`),
  rebase:     (name: string, baseBranch: string)      =>
    api.post<{ output?: string; error?: string }>(`/api/repos/${encodeURIComponent(name)}/rebase`, { baseBranch }),
  cherryPick: (name: string, commits: string[])       =>
    api.post<{ output?: string; error?: string }>(`/api/repos/${encodeURIComponent(name)}/cherry-pick`, { commits }),
  merge:      (name: string, branchName: string)       =>
    api.post<void>(`/api/repos/${encodeURIComponent(name)}/merge`, { branchName }),
  status:     (name: string)                           =>
    api.get<{ branch: string; behind: number; hasRemote: boolean; changedFiles: import('./types').GitChangedFile[] }>(
      `/api/repos/${encodeURIComponent(name)}/status`),
  pull:       (name: string)                           =>
    api.post<{ output: string }>(`/api/repos/${encodeURIComponent(name)}/pull`, {}),
  checkout:   (name: string, branch: string)           =>
    api.post<{ output: string }>(`/api/repos/${encodeURIComponent(name)}/checkout`, { branch }),
};

export const workspaceApi = {
  tree: (name: string, path = '') =>
    api.get<{ path: string; entries: WorkspaceEntry[] }>(
      `/api/repos/${encodeURIComponent(name)}/workspace/tree?path=${encodeURIComponent(path)}`,
    ),
  file: (name: string, path: string) =>
    api.get<WorkspaceFile>(
      `/api/repos/${encodeURIComponent(name)}/workspace/file?path=${encodeURIComponent(path)}`,
    ),
  save: (name: string, path: string, content: string, revision: string, force = false) =>
    api.put<{ revision: string }>(`/api/repos/${encodeURIComponent(name)}/workspace/file`, {
      path, content, revision, force,
    }),
  create: (name: string, path: string, type: 'file' | 'directory') =>
    api.post<{ path: string }>(`/api/repos/${encodeURIComponent(name)}/workspace/entry`, { path, type }),
  move: (name: string, path: string, destination: string) =>
    api.patch<{ path: string }>(`/api/repos/${encodeURIComponent(name)}/workspace/entry`, { path, destination }),
  remove: (name: string, path: string) =>
    api.delete<{ ok: boolean }>(
      `/api/repos/${encodeURIComponent(name)}/workspace/entry?path=${encodeURIComponent(path)}`,
    ),
  diff: (name: string, path = '') =>
    api.get<{ diff: string }>(
      `/api/repos/${encodeURIComponent(name)}/workspace/diff?path=${encodeURIComponent(path)}`,
    ),
  eventsUrl: (name: string) => `/api/repos/${encodeURIComponent(name)}/workspace/events`,
  terminalUrl: (name: string, path = '') => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return `${protocol}//${window.location.host}/api/repos/${encodeURIComponent(name)}/workspace/terminal${query}`;
  },
};

export const workspaceChatApi = {
  state: (name: string) =>
    api.get<WorkspaceChatState>(`/api/repos/${encodeURIComponent(name)}/workspace/chat`),
  send: (name: string, message: string) =>
    api.post<{ turnId: string }>(
      `/api/repos/${encodeURIComponent(name)}/workspace/chat/message`,
      { message },
    ),
  setMode: (name: string, mode: WorkspaceChatMode) =>
    api.put<{ mode: WorkspaceChatMode }>(
      `/api/repos/${encodeURIComponent(name)}/workspace/chat/mode`,
      { mode },
    ),
  cancel: (name: string) =>
    api.post<{ status: string }>(
      `/api/repos/${encodeURIComponent(name)}/workspace/chat/cancel`,
      {},
    ),
  reset: (name: string) =>
    api.delete<{ ok: boolean }>(`/api/repos/${encodeURIComponent(name)}/workspace/chat/reset`),
  streamUrl: (name: string, turnId: string) =>
    `/api/repos/${encodeURIComponent(name)}/workspace/chat/stream?turnId=${encodeURIComponent(turnId)}`,
};
