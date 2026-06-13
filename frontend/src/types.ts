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
  cost?: boolean;
  planRunId?: string;
}

export interface CostResource {
  name: string;
  type: string;
  monthlyCost: number;
}

export interface CostEstimate {
  currency: string;
  totalMonthly: number;
  diffMonthly: number;
  hasDiff: boolean;
  resourceCount?: number;
  resources?: CostResource[];
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
  approvalExpiresAt?: string;
  results?: ReportEnvResult[];
  add?: number;
  change?: number;
  destroy?: number;
  savedPlanReady?: boolean;
  savedPlanExpiresAt?: string;
  hasGraph?: boolean;
}

export type GraphAction = 'create' | 'update' | 'delete' | 'replace' | '';
export type GraphNodeKind = 'repository' | 'group' | 'target' | 'module' | 'managed' | 'data';

export interface GraphChangeDetail {
  path: string;
  kind: 'added' | 'removed' | 'updated';
  sensitive?: boolean;
  computed?: boolean;
  replacement?: boolean;
}

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  address?: string;
  parent?: string;
  repo?: string;
  group?: string;
  target?: string;
  action?: GraphAction;
  changes?: GraphChangeDetail[];
  command?: string;
  result?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'containment' | 'dependency';
}

export interface GraphDocument {
  runId: string;
  repo: string;
  revision: number;
  updatedAt?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  errors?: string[];
}

export interface WebSettings {
  savedPlanApply: boolean;
  approvalTimeoutSeconds: number;
  reviewedPlanTimeoutSeconds: number;
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
  default_aws_profile?: string;
  default_account_id?: string;
  default_region?: string;
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
  applied: boolean;
  add: number;
  change: number;
  destroy: number;
  envs: number;
  failed: number;
  hasCost?: boolean;
  currency?: string;
  totalMonthly?: number;
  diffMonthly?: number;
}

export interface ReportEnvResult {
  env: string;
  profile: string;
  applied: boolean;
  failed: boolean;
  noChanges: boolean;
  add: number;
  change: number;
  destroy: number;
  output: string;
  cost?: CostEstimate;
}

export interface ReportData {
  command: string;
  runAt?: string;
  repoLabel?: string;
  applied: boolean;
  add: number;
  change: number;
  destroy: number;
  envs: number;
  failed: number;
  results?: ReportEnvResult[];
  hasCost?: boolean;
  currency?: string;
  totalMonthly?: number;
  diffMonthly?: number;
}

export interface InfracostSettings {
  enabledByDefault: boolean;
  currency: string;
  tokenConfigured: boolean;
}

export interface CostSummaryItem {
  report: string;
  runAt: string;
  currency: string;
  totalMonthly: number;
  resourceCount: number;
}

export interface CostServiceRow {
  type: string;
  count: number;
  monthlyCost: number;
}

export interface CostDetail {
  report: string;
  runAt: string;
  currency: string;
  totalMonthly: number;
  resourceCount: number;
  resources: CostResource[];
  byService: CostServiceRow[];
}

export interface CostSummary {
  items: CostSummaryItem[];
  latest: CostDetail | null;
}

// ── Breakdown scans (infracost breakdown across configured repo targets) ──
export interface CostTarget {
  repo: string;
  target: string;
  group: string;
  directory: string;
  currency: string;
  totalMonthly: number;
  resourceCount: number;
  resources?: CostResource[];
  error?: string;
}

export interface CostScan {
  runAt: string;
  currency: string;
  totalMonthly: number;
  targets: CostTarget[];
}

export interface CostTargetDiff {
  repo: string;
  target: string;
  group: string;
  oldMonthly: number;
  newMonthly: number;
  change: number;
  status: 'added' | 'removed' | 'increased' | 'decreased' | 'unchanged';
}

export interface CostResourceDiff {
  repo: string;
  target: string;
  name: string;
  type: string;
  oldMonthly: number;
  newMonthly: number;
  change: number;
  status: 'added' | 'removed' | 'increased' | 'decreased';
}

export interface CostScanDiff {
  oldRunAt?: string;
  newRunAt: string;
  currency: string;
  oldTotal: number;
  newTotal: number;
  change: number;
  targets: CostTargetDiff[];
  resources: CostResourceDiff[];
}

export interface CostScanResult {
  scan: CostScan | null;
  diff: CostScanDiff | null;
}

export interface CostScanHistoryItem {
  runAt: string;
  currency: string;
  totalMonthly: number;
  targets: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type Page =
  | { id: 'overview' }
  | { id: 'runs'; newRun?: boolean; filterQuery?: string }
  | { id: 'repos' }
  | { id: 'workspace'; name?: string }
  | { id: 'config' }
  | { id: 'profile-mappings' }
  | { id: 'reports' }
  | { id: 'report'; name: string }
  | { id: 'graph'; runId?: string }
  | { id: 'cost' }
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

export interface WorkspaceEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  modified?: string;
}

export interface WorkspaceFile {
  path: string;
  content: string;
  revision: string;
  size: number;
  language: string;
  readOnly: boolean;
  binary: boolean;
}

export type WorkspaceChatMode = 'review' | 'autoApply';

export interface WorkspaceChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface WorkspaceChatState {
  available: boolean;
  authError?: string;
  mode: WorkspaceChatMode;
  messages: WorkspaceChatMessage[];
  running: boolean;
  activeTurnId?: string;
}

export interface WorkspaceChatEvent {
  type: 'delta' | 'tool' | 'status' | 'error' | 'done';
  delta?: string;
  message?: string;
  tool?: string;
  summary?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}
