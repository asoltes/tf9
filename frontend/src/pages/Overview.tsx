import Shell from '../Shell';
import { useNav } from '../nav';
import type { Page } from '../types';
import './Overview.css';

interface OverviewProps {
  // Retained for App compatibility; the prototype hub is static.
  firstRun: boolean;
}

const ARROW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

interface HubCard {
  page: Page;
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  desc: string;
  go: string;
}

const CARDS: HubCard[] = [
  {
    page: { id: 'runs' },
    iconClass: 'blue',
    title: 'Runs',
    desc: 'Run history and the live split panel — concurrent parallel terminals, promotion stepper, side/bottom dock.',
    go: 'Open Runs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    page: { id: 'runs', newRun: true },
    iconClass: 'green',
    title: 'New run',
    desc: 'Pick a command, repo and branch; choose targets by pipeline with a live CLI preview and danger checks.',
    go: 'Open New run',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="10 8 16 12 10 16" />
      </svg>
    ),
  },
  {
    page: { id: 'repos' },
    iconClass: 'purple',
    title: 'Repositories',
    desc: 'Each top-level directory is its own promotion pipeline. Drag stages to set execution order.',
    go: 'Open Repositories',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    page: { id: 'config' },
    iconClass: 'grey',
    title: 'Config YAML',
    desc: 'A real code editor — gutter, syntax highlighting, current-line, and live schema validation with a problems pane.',
    go: 'Open editor',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    page: { id: 'reports' },
    iconClass: 'orange',
    title: 'Reports',
    desc: 'Self-contained plan / apply / destroy reports with search, copy resource addresses, and raw terminal output.',
    go: 'Open report',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    page: { id: 'help' },
    iconClass: 'blue',
    title: 'Help',
    desc: 'Quick start, the config schema, and CLI command reference with copyable snippets.',
    go: 'Open Help',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
];

export default function Overview(_props: OverviewProps) {
  const { navigate } = useNav();

  return (
    <Shell>
      <div className="overview-page">
        <div className="hub-hero">
          <div className="mk">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div>
            <h1>tf9</h1>
            <p>
              Run Terraform across ordered repository targets. A redesigned, themeable interface —
              explore each surface below. Toggle light / dark from the top-right; it carries across
              every page.
            </p>
          </div>
        </div>

        <div className="hub-grid">
          {CARDS.map((card, i) => (
            <a
              key={i}
              className="hub-card"
              href={card.page.id === 'runs' && card.page.newRun ? '#runs/new' : `#${card.page.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(card.page);
              }}
            >
              <div className={`ic ${card.iconClass}`}>{card.icon}</div>
              <div className="ct">{card.title}</div>
              <div className="cd">{card.desc}</div>
              <div className="go">
                {card.go} {ARROW}
              </div>
            </a>
          ))}
        </div>
      </div>
    </Shell>
  );
}
