import React from 'react';
import { useNav } from './nav';
import type { Page } from './types';
import StsBadge from './components/StsBadge';

/**
 * Plain-JSX application shell, a verbatim port of the prototype's topnav +
 * sidenav + crumbs + content layout (design_handoff_tfops/). Cloudscape's
 * AppLayout/TopNavigation/SideNavigation are intentionally dropped here.
 *
 * The split-panel props are retained on the interface for source compatibility
 * with pages (e.g. Runs) that have not yet been ported; they are ignored until
 * their phase lands.
 */
interface ShellProps {
  children: React.ReactNode;
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
}

const PRIMARY_LINKS: SideLink[] = [
  { id: 'overview', text: 'Overview', href: '#overview' },
  { id: 'runs', text: 'Runs', href: '#runs' },
];

const SETTINGS_LINKS: SideLink[] = [
  { id: 'repos', text: 'Repositories', href: '#repos' },
  { id: 'config', text: 'Config YAML', href: '#config' },
  { id: 'profile-mappings', text: 'CLI Directory Profiles', href: '#profile-mappings' },
];

const SECONDARY_LINKS: SideLink[] = [
  { id: 'reports', text: 'Reports', href: '#reports' },
  { id: 'logs', text: 'Logs', href: '#logs' },
  { id: 'help', text: 'Help', href: '#help' },
];

const CRUMBS: Record<Page['id'], { text: string; page: Page | null }[]> = {
  overview: [{ text: 'tfops', page: { id: 'overview' } }, { text: 'Overview', page: null }],
  runs: [{ text: 'tfops', page: { id: 'overview' } }, { text: 'Runs', page: null }],
  repos: [
    { text: 'tfops', page: { id: 'overview' } },
    { text: 'Settings', page: { id: 'repos' } },
    { text: 'Repositories', page: null },
  ],
  config: [
    { text: 'tfops', page: { id: 'overview' } },
    { text: 'Settings', page: { id: 'repos' } },
    { text: 'Config YAML', page: null },
  ],
  reports: [{ text: 'tfops', page: { id: 'overview' } }, { text: 'Reports', page: null }],
  report: [
    { text: 'tfops', page: { id: 'overview' } },
    { text: 'Reports', page: { id: 'reports' } },
    { text: 'View', page: null },
  ],
  'profile-mappings': [
    { text: 'tfops', page: { id: 'overview' } },
    { text: 'Settings', page: { id: 'repos' } },
    { text: 'CLI Directory to Profile Mappings', page: null },
  ],
  logs: [{ text: 'tfops', page: { id: 'overview' } }, { text: 'Logs', page: null }],
  help: [{ text: 'tfops', page: { id: 'overview' } }, { text: 'Help', page: null }],
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

export default function Shell({ children }: ShellProps) {
  const { page, navigate, mode, toggleTheme, userEmail } = useNav();

  const [navCollapsed, setNavCollapsed] = React.useState<boolean>(() => {
    return localStorage.getItem('tfops-nav-collapsed') === '1';
  });
  function toggleNav() {
    setNavCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('tfops-nav-collapsed', next ? '1' : '0');
      return next;
    });
  }

  function go(e: React.MouseEvent, p: Page) {
    e.preventDefault();
    navigate(p);
  }

  function renderLink(link: SideLink) {
    const active = page.id === link.id;
    return (
      <a
        key={link.id}
        href={link.href}
        className={active ? 'active' : undefined}
        onClick={(e) => go(e, { id: link.id } as Page)}
      >
        {link.text}
      </a>
    );
  }

  const crumbs = CRUMBS[page.id] ?? [{ text: 'tfops', page: { id: 'overview' } as Page }];

  return (
    <>
      <div className="topnav">
        <div className="brand">
          <span style={{ display: 'flex', color: '#ff9900' }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </span>{' '}
          tfops
        </div>
        <div className="tn-sep" />
        <a
          className="tn-item"
          href="#runs"
          style={{ textDecoration: 'none' }}
          onClick={(e) => go(e, { id: 'runs' })}
        >
          Runs
        </a>
        <a
          className="tn-item"
          href="#reports"
          style={{ textDecoration: 'none' }}
          onClick={(e) => go(e, { id: 'reports' })}
        >
          Reports
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
        <nav className="sidenav">
          <div className="nav-links">
            {PRIMARY_LINKS.map(renderLink)}
            <div className="nav-div" />
            <div className="nav-sec">Settings</div>
            {SETTINGS_LINKS.map(renderLink)}
            <div className="nav-div" />
            {SECONDARY_LINKS.map(renderLink)}
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

        <main className="content">
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
