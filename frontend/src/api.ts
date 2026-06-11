import type { GitCommit, Identity, LogLevel, LogsResponse } from './types';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new Error(err?.error?.message ?? res.statusText);
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

// ── Repo git operations ───────────────────────────────────────────

export const repoGit = {
  branches:   (name: string)                          =>
    api.get<string[]>(`/api/repos/${encodeURIComponent(name)}/branches`),
  commits:    (name: string, base: string, head: string) =>
    api.get<GitCommit[]>(`/api/repos/${encodeURIComponent(name)}/commits?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`),
  rebase:     (name: string, baseBranch: string)      =>
    api.post<void>(`/api/repos/${encodeURIComponent(name)}/rebase`, { baseBranch }),
  cherryPick: (name: string, commits: string[])       =>
    api.post<void>(`/api/repos/${encodeURIComponent(name)}/cherry-pick`, { commits }),
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
