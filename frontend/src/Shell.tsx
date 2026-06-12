import React from 'react';
import { useNav } from './nav';
import type { Page } from './types';
import StsBadge from './components/StsBadge';

/**
 * Plain-JSX application shell, a verbatim port of the prototype's topnav +
 * sidenav + crumbs + content layout (design_handoff_tf9/). Cloudscape's
 * AppLayout/TopNavigation/SideNavigation are intentionally dropped here.
 *
 * The split-panel props are retained on the interface for source compatibility
 * with pages (e.g. Runs) that have not yet been ported; they are ignored until
 * their phase lands.
 */
interface ShellProps {
  children: React.ReactNode;
  fullWidth?: boolean;
  contentType?: unknown;
  splitPanel?: React.ReactNode;
  splitPanelOpen?: boolean;
  splitPanelSize?: number;
  splitPanelPreferences?: unknown;
  onSplitPanelToggle?: unknown;
  onSplitPanelResize?: unknown;
  onSplitPanelPreferencesChange?: unknown;
}

interface SideLink {
  id: Page['id'];
  text: string;
  href: string;
  icon: React.ReactNode;
}

const ni = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

// Visible labels for every destination. Route IDs and hashes are unchanged.
const ICONS: Record<string, React.ReactNode> = {
  overview: ni('M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-4H3zM13 7h8V3h-8z'),
  runs: ni('M4 17l6-6-6-6M12 19h8'),
  workspace: ni('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
  repos: ni('M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'),
  config: ni('M16 18l6-6-6-6M8 6l-6 6 6 6'),
  'profile-mappings': ni('M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM5 21v-2a7 7 0 0 1 14 0v2'),
  reports: ni('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5'),
  cost: ni('M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'),
  logs: ni('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  help: ni('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3M12 17h.01'),
};

const LABELS: Record<Page['id'], string> = {
  overview: 'Dashboard',
  runs: 'Run History',
  workspace: 'Repository Workspace',
  repos: 'Repositories',
  config: 'Configuration',
  'profile-mappings': 'AWS Profile Mappings',
  reports: 'Terraform Reports',
  report: 'Terraform Reports',
  cost: 'Cost Analysis',
  logs: 'System Logs',
  help: 'Documentation',
};

const link = (id: Page['id']): SideLink => ({ id, text: LABELS[id], href: `#${id}`, icon: ICONS[id] });

const NAV_GROUPS: { label: string | null; links: SideLink[] }[] = [
  { label: 'Operations', links: [link('overview'), link('runs'), link('workspace')] },
  { label: 'Configuration', links: [link('repos'), link('config'), link('profile-mappings')] },
  { label: 'Insights & Support', links: [link('reports'), link('cost'), link('logs'), link('help')] },
];

const crumb = (id: Page['id']): { text: string; page: Page | null }[] => [
  { text: 'tf9', page: { id: 'overview' } },
  { text: LABELS[id], page: null },
];

const CRUMBS: Record<Page['id'], { text: string; page: Page | null }[]> = {
  overview: crumb('overview'),
  runs: crumb('runs'),
  workspace: crumb('workspace'),
  repos: [
    { text: 'tf9', page: { id: 'overview' } },
    { text: 'Configuration', page: { id: 'repos' } },
    { text: LABELS.repos, page: null },
  ],
  config: [
    { text: 'tf9', page: { id: 'overview' } },
    { text: 'Configuration', page: { id: 'repos' } },
    { text: LABELS.config, page: null },
  ],
  'profile-mappings': [
    { text: 'tf9', page: { id: 'overview' } },
    { text: 'Configuration', page: { id: 'repos' } },
    { text: LABELS['profile-mappings'], page: null },
  ],
  reports: crumb('reports'),
  report: [
    { text: 'tf9', page: { id: 'overview' } },
    { text: LABELS.reports, page: { id: 'reports' } },
    { text: 'View', page: null },
  ],
  cost: crumb('cost'),
  logs: crumb('logs'),
  help: crumb('help'),
};

const ICON_SUN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  </svg>
);
const ICON_MOON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
// Half-filled moon for the lighter "dim" theme.
const ICON_DIM = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    <path d="M11.2 3a7 7 0 0 0 9.8 9.8A9 9 0 0 1 12 21z" fill="currentColor" stroke="none" opacity="0.45" />
  </svg>
);

const ICON_COLLAPSE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const ICON_EXPAND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default function Shell({ children, fullWidth = false }: ShellProps) {
  const { page, navigate, mode, toggleTheme, userEmail } = useNav();

  const [navCollapsed, setNavCollapsed] = React.useState<boolean>(() => {
    return typeof localStorage !== 'undefined' && localStorage.getItem('tf9-nav-collapsed') === '1';
  });
  function toggleNav() {
    setNavCollapsed(prev => {
      const next = !prev;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tf9-nav-collapsed', next ? '1' : '0');
      }
      return next;
    });
  }

  function go(e: React.MouseEvent, p: Page) {
    e.preventDefault();
    navigate(p);
  }

  function renderLink(l: SideLink) {
    // The report viewer keeps Terraform Reports highlighted as its section.
    const active = page.id === l.id || (l.id === 'reports' && page.id === 'report');
    return (
      <a
        key={l.id}
        href={l.href}
        className={active ? 'active' : undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={l.text}
        title={navCollapsed ? l.text : undefined}
        onClick={(e) => go(e, { id: l.id } as Page)}
      >
        <span className="nav-ic">{l.icon}</span>
        <span className="nav-txt">{l.text}</span>
      </a>
    );
  }

  const crumbs = CRUMBS[page.id] ?? [{ text: 'tf9', page: { id: 'overview' } as Page }];

  return (
    <>
      <div className="topnav">
        <div className="brand" aria-label="tf9">
          <img src="/tf9-logo.svg" alt="tf9" />
        </div>
        <div className="tn-sep" />
        <a
          className="tn-item"
          href="#workspace"
          style={{ textDecoration: 'none' }}
          onClick={(e) => go(e, { id: 'workspace' })}
        >
          Repository Workspace
        </a>
        <a
          className="tn-item"
          href="#runs"
          style={{ textDecoration: 'none' }}
          onClick={(e) => go(e, { id: 'runs' })}
        >
          Run History
        </a>
        <a
          className="tn-item"
          href="#reports"
          style={{ textDecoration: 'none' }}
          onClick={(e) => go(e, { id: 'reports' })}
        >
          Terraform Reports
        </a>
        <div className="tn-spacer" />
        <div className="tn-right">
          <div
            className="tn-theme"
            role="button"
            tabIndex={0}
            aria-label="Cycle theme"
            title={`Theme: ${mode} — click to cycle (light → dark → dim)`}
            onClick={toggleTheme}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleTheme();
              }
            }}
          >
            {mode === 'light' ? ICON_SUN : mode === 'dim' ? ICON_DIM : ICON_MOON}
          </div>
          <StsBadge />
          <div className="tn-item">{userEmail || 'andres@company'}</div>
        </div>
      </div>

      <div className={`layout${navCollapsed ? ' nav-collapsed' : ''}`}>
        <nav className="sidenav" aria-label="Primary">
          <div className="nav-links">
            {NAV_GROUPS.map((group, gi) => (
              <React.Fragment key={group.label ?? gi}>
                {gi > 0 && <div className="nav-div" />}
                {group.label && <div className="nav-sec">{group.label}</div>}
                {group.links.map(renderLink)}
              </React.Fragment>
            ))}
          </div>
          <button
            className="nav-toggle-btn"
            aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleNav}
          >
            {navCollapsed ? ICON_EXPAND : ICON_COLLAPSE}
          </button>
        </nav>

        <main className={`content${fullWidth ? ' shell-full-width' : ''}`}>
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="sep">/</span>}
                {c.page ? (
                  <a href={`#${c.page.id}`} onClick={(e) => go(e, c.page as Page)}>
                    {c.text}
                  </a>
                ) : (
                  <span className="cur">{c.text}</span>
                )}
              </React.Fragment>
            ))}
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
