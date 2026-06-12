import { lazy, Suspense, useState, useEffect } from 'react';
import { api, awsApi } from './api';
import type { Repo, Paginated } from './types';
import { identityLabel } from './lib/identity';
import { NavContext } from './nav';
import { ToastProvider } from './components/ToastProvider';
import type { Page } from './types';
import Runs from './pages/Runs';
import Repos from './pages/Repos';
import ConfigYaml from './pages/ConfigYaml';
import ReportsPage from './pages/Reports';
import ReportViewer from './pages/ReportViewer';
import CostPage from './pages/Cost';
import LogsPage from './pages/Logs';
import Help from './pages/Help';
import Overview from './pages/Overview';
import ProfileMappingsPage from './pages/ProfileMappings';

const RepositoryWorkspace = lazy(() => import('./pages/RepositoryWorkspace'));

const MODE_KEY = 'tf9-color-mode';
type Mode = 'light' | 'dark' | 'dim';

function getInitialMode(): Mode {
  // localStorage holds the tri-state choice; the data-theme attribute alone can't
  // distinguish 'dim' (it shares data-theme="dark"), so check storage first.
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'dim') return stored;
  } catch {
    /* ignore */
  }
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ── Page routing ───────────────────────────────────────────────────

function PageContent({
  page,
  mode,
  firstRun,
}: {
  page: Page;
  mode: Mode;
  firstRun: boolean;
}) {
  switch (page.id) {
    case 'overview': return <Overview firstRun={firstRun} />;
    case 'runs':     return <Runs openNewRun={page.newRun} />;
    case 'repos':    return <Repos />;
    case 'workspace': return (
      <Suspense fallback={<div className="workspace-loading">Loading workspace…</div>}>
        <RepositoryWorkspace name={page.name} />
      </Suspense>
    );
    case 'config':            return <ConfigYaml />;
    case 'profile-mappings':  return <ProfileMappingsPage />;
    case 'reports':           return <ReportsPage />;
    case 'report':   return <ReportViewer name={page.name} mode={mode} />;
    case 'cost':     return <CostPage />;
    case 'logs':     return <LogsPage />;
    case 'help':     return <Help />;
  }
}

function parseHash(raw: string): Page {
  const h = raw.replace(/^#/, '');
  if (!h || h === 'overview') return { id: 'overview' };
  if (h.startsWith('report/')) return { id: 'report', name: h.slice(7) };
  if (h === 'workspace') return { id: 'workspace' };
  if (h.startsWith('workspace/')) return { id: 'workspace', name: decodeURIComponent(h.slice(10)) };
  if (h.startsWith('repo/')) return { id: 'workspace', name: decodeURIComponent(h.slice(5)) };
  if (h === 'runs/new') return { id: 'runs', newRun: true };
  switch (h) {
    case 'runs':    return { id: 'runs' };
    case 'repos':   return { id: 'repos' };
    case 'config':            return { id: 'config' };
    case 'profile-mappings':  return { id: 'profile-mappings' };
    case 'reports':           return { id: 'reports' };
    case 'cost':              return { id: 'cost' };
    case 'logs':              return { id: 'logs' };
    case 'help':              return { id: 'help' };
    default:                  return { id: 'overview' };
  }
}

function pageToHash(p: Page): string {
  if (p.id === 'report') return `#report/${p.name}`;
  if (p.id === 'workspace') return p.name ? `#workspace/${encodeURIComponent(p.name)}` : '#workspace';
  if (p.id === 'runs' && p.newRun) return '#runs/new';
  return `#${p.id}`;
}

export default function App() {
  const [page, setPage] = useState<Page>(() => parseHash(window.location.hash));
  const [mode, setMode] = useState<Mode>(getInitialMode);
  const [firstRun, setFirstRun] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');

  // Apply theme to <html> and persist. 'dim' rides on data-theme="dark" plus a
  // data-variant="dim" attribute so it inherits every dark rule and only lightens
  // surfaces via the dim override layer in the stylesheets.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
    if (mode === 'dim') {
      document.documentElement.setAttribute('data-variant', 'dim');
    } else {
      document.documentElement.removeAttribute('data-variant');
    }
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  useEffect(() => {
    api.get<Paginated<Repo>>('/api/repos')
      .then(r => { if ((r?.items ?? []).length === 0) setFirstRun(true); })
      .catch(() => {});
  }, []);

  // Real identity label for the topnav user item (falls back to placeholder).
  useEffect(() => {
    awsApi.identity()
      .then((id) => { if (id?.arn) setUserEmail(identityLabel(id.arn)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onHashChange() {
      setPage(parseHash(window.location.hash));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function navigate(p: Page) {
    setPage(p);
    window.location.hash = pageToHash(p);
  }

  function toggleTheme() {
    // Cycle Light → Dark → Dim → Light.
    setMode(m => (m === 'light' ? 'dark' : m === 'dark' ? 'dim' : 'light'));
  }

  return (
    <ToastProvider>
      <NavContext.Provider value={{ page, navigate, mode, toggleTheme, userEmail }}>
        <PageContent page={page} mode={mode} firstRun={firstRun} />
      </NavContext.Provider>
    </ToastProvider>
  );
}
