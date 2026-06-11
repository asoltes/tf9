export type RunStatus = 'running' | 'success' | 'failed' | 'cancelled' | 'denied';

export interface ImportSpec {
  addr: string;
  id: string;
}

export interface RunRequest {
  command: string;
  repo: string;
  envFilter: string;
  profile: string;
  extraArgs: string[];
  nonprodOnly: boolean;
  autoApprove: boolean;
  parallel: boolean;
  promotionOrder: string[];
  lockIds?: Record<string, string>;
  importAddrs?: Record<string, ImportSpec>;
}

export interface Run {
  id: string;
  status: RunStatus;
  command: string;
  envFilter: string;
  repo: string;
  startedAt: string;
  finishedAt?: string;
  request: RunRequest;
  lines?: string[];
  reportPath?: string;
  gitBranch?: string;
  targetDirs?: string[];
  awaitingInput?: boolean;
  results?: ReportEnvResult[];
  add?: number;
  change?: number;
  destroy?: number;
}

export interface Repo {
  name: string;
  path: string;
  disabled?: boolean;
}

export interface RepoTarget {
  name: string;
  directory: string;
  aws_profile: string;
  account_id?: string;
  region?: string;
  disabled?: boolean;
  group?: string;
}

export interface RepoConfig {
  targets: RepoTarget[];
}

export interface BrowseEntry {
  name: string;
  isDir: boolean;
  hasTf: boolean;
}

export interface BrowseResult {
  repoRoot: string;
  path: string;
  entries: BrowseEntry[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface Report {
  name: string;
  command: string;
  runAt: string;
  sizeKb: number;
  isLive: boolean;
  add: number;
  change: number;
  destroy: number;
  envs: number;
  failed: number;
}

export interface ReportEnvResult {
  env: string;
  profile: string;
  failed: boolean;
  noChanges: boolean;
  add: number;
  change: number;
  destroy: number;
  output: string;
}

export interface ReportData {
  command: string;
  runAt?: string;
  repoLabel?: string;
  add: number;
  change: number;
  destroy: number;
  envs: number;
  failed: number;
  results?: ReportEnvResult[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type Page =
  | { id: 'overview' }
  | { id: 'runs'; newRun?: boolean }
  | { id: 'repos' }
  | { id: 'config' }
  | { id: 'profile-mappings' }
  | { id: 'reports' }
  | { id: 'report'; name: string }
  | { id: 'logs' }
  | { id: 'help' };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogsResponse {
  level: LogLevel;
  lines: string[];
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
}

export interface Identity {
  account: string;
  arn: string;
  userId: string;
  profile?: string;
}

export interface GitChangedFile {
  xy: string;   // two-char porcelain code, e.g. "M ", " M", "??"
  path: string;
}
