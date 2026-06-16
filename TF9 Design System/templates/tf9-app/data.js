// TF9 UI Kit — mock data
// Realistic fake runs, repos, reports

const REPOS = [
  'aws-platform/infra-live',
  'aws-platform/eks-clusters',
  'aws-platform/vpc-networking',
  'data-platform/s3-buckets',
  'security/iam-policies',
];

const COMMANDS = ['plan','apply','destroy','init','validate','refresh','state','import'];
const STATUSES = ['success','success','success','failed','partial_success','running','cancelled','denied'];
const BRANCHES = ['main','feature/vpc-peering','hotfix/sg-rules','main','main'];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function genRun(i) {
  const cmd = randomFrom(['plan','plan','apply','apply','destroy','init','validate']);
  const status = i === 0 ? 'running' : randomFrom(['success','success','success','failed','partial_success','cancelled','denied']);
  const startedAt = new Date(Date.now() - i * 23 * 60 * 1000 - Math.random() * 3600000);
  const duration = Math.floor(30 + Math.random() * 300);
  return {
    id: `run_${Math.random().toString(36).slice(2, 12)}`,
    command: cmd,
    repo: randomFrom(REPOS),
    branch: randomFrom(BRANCHES),
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: status === 'running' ? null : new Date(startedAt.getTime() + duration * 1000).toISOString(),
    duration,
    add: status === 'success' ? Math.floor(Math.random() * 12) : 0,
    change: status === 'success' ? Math.floor(Math.random() * 5) : 0,
    destroy: cmd === 'destroy' ? Math.floor(Math.random() * 3) : 0,
    targets: Math.random() > 0.5 ? [randomFrom(REPOS).split('/')[1]] : [],
    parallel: Math.random() > 0.6,
  };
}

window.TF9_DATA = {
  runs: Array.from({ length: 40 }, (_, i) => genRun(i)),
  repos: REPOS.map((path, i) => ({
    id: `repo_${i}`,
    path,
    provider: 'github',
    branch: 'main',
    lastRun: new Date(Date.now() - i * 86400000).toISOString(),
  })),
  reports: Array.from({ length: 12 }, (_, i) => ({
    name: `${randomFrom(['plan','apply','destroy'])}_${REPOS[i % REPOS.length].split('/')[1]}_${new Date(Date.now() - i * 3600000 * 6).toISOString().slice(0,10)}`,
    command: randomFrom(['plan','apply','destroy']),
    runAt: new Date(Date.now() - i * 3600000 * 6).toISOString(),
  })),
  identity: { arn: 'arn:aws:sts::123456789012:assumed-role/AdminRole/andres', account: '123456789012' },
  userEmail: 'andres@company.io',
};

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return `${Math.floor(diff/86400000)}d ago`;
}
function duration(s, e) {
  if (!e) return '—';
  const ms = new Date(e) - new Date(s);
  if (ms < 60000) return `${Math.round(ms/1000)}s`;
  return `${Math.floor(ms/60000)}m ${Math.round((ms%60000)/1000)}s`;
}
window.TF9_UTILS = { relativeTime, duration };
