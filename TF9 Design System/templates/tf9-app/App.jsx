// TF9 App — self-contained template entry. Registers window.TF9App.
// TF9 Shell — topnav + collapsible sidenav
// Exports to window.TF9Shell

const NAV_GROUPS = [
  {
    label: 'Operations',
    links: [
      { id: 'overview',   text: 'Dashboard',              path: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-4H3zM13 7h8V3h-8z' },
      { id: 'runs',       text: 'Run History',            path: 'M4 17l6-6-6-6M12 19h8' },
      { id: 'workspace',  text: 'Repository Workspace',   path: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    ],
  },
  {
    label: 'Configuration',
    links: [
      { id: 'repos',    text: 'Repositories',        path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
      { id: 'config',   text: 'Configuration',       path: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
      { id: 'profiles', text: 'AWS Profile Mappings',path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM5 21v-2a7 7 0 0 1 14 0v2' },
    ],
  },
  {
    label: 'Insights & Support',
    links: [
      { id: 'reports', text: 'Terraform Reports', path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5' },
      { id: 'graph',   text: 'Graph View',         path: 'M6 5h4v4H6zM14 3h4v4h-4zM14 15h4v4h-4zM4 16h4v4H4zM10 7l4-2M8 9l7 6M8 18l6-1' },
      { id: 'cost',    text: 'Cost Analysis',       path: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
      { id: 'logs',    text: 'System Logs',         path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    ],
  },
];

const CRUMBS = {
  overview: [{ text: 'tf9' }, { text: 'Dashboard', current: true }],
  runs:     [{ text: 'tf9' }, { text: 'Run History', current: true }],
  workspace:[{ text: 'tf9' }, { text: 'Repository Workspace', current: true }],
  repos:    [{ text: 'tf9' }, { text: 'Configuration' }, { text: 'Repositories', current: true }],
  config:   [{ text: 'tf9' }, { text: 'Configuration' }, { text: 'Configuration', current: true }],
  profiles: [{ text: 'tf9' }, { text: 'Configuration' }, { text: 'AWS Profile Mappings', current: true }],
  reports:  [{ text: 'tf9' }, { text: 'Terraform Reports', current: true }],
  graph:    [{ text: 'tf9' }, { text: 'Graph View', current: true }],
  cost:     [{ text: 'tf9' }, { text: 'Cost Analysis', current: true }],
  logs:     [{ text: 'tf9' }, { text: 'System Logs', current: true }],
};

function Icon({ path, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function Shell({ page, navigate, mode, toggleTheme, children, fullWidth }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const crumbs = CRUMBS[page] || [{ text: 'tf9' }, { text: page, current: true }];

  const topnavStyle = {
    height: '56px', background: 'var(--nav-bg)', color: '#fff',
    display: 'flex', alignItems: 'center', padding: '0 20px', gap: '18px',
    position: 'sticky', top: 0, zIndex: 1000, flexShrink: 0,
  };

  const sidenavStyle = {
    width: collapsed ? '52px' : '236px',
    flexShrink: 0,
    background: 'var(--container)',
    borderRight: '1px solid var(--divider)',
    position: 'sticky',
    top: '56px',
    alignSelf: 'flex-start',
    height: 'calc(100vh - 56px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width .18s ease',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'var(--sans)', background: 'var(--bg-layout)' }}>
      {/* Topnav */}
      <div style={topnavStyle}>
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => navigate('overview')}>
          <img src="../../assets/tf9-logo.svg" alt="tf9" style={{ width: 120, height: 42, display: 'block' }} />
        </div>
        <div style={{ width: 1, height: 20, background: '#2f3e51' }} />
        {[['workspace','Repository Workspace'],['runs','Run History'],['reports','Terraform Reports']].map(([id, label]) => (
          <a key={id} onClick={e => { e.preventDefault(); navigate(id); }}
            style={{
              color: page === id ? '#fff' : '#d5dbdb', fontSize: '13px',
              display: 'flex', alignItems: 'center', height: '56px',
              padding: '0 8px', cursor: 'pointer', textDecoration: 'none',
              background: page === id ? 'var(--nav-bg-2)' : 'transparent',
            }}
          >{label}</a>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button onClick={toggleTheme} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 6, border: 'none',
            background: 'transparent', color: '#d5dbdb', cursor: 'pointer',
          }}>
            {mode === 'light' ? <SunIcon /> : <MoonIcon />}
          </button>
          <span style={{ color: '#d5dbdb', fontSize: 13, padding: '0 8px' }}>
            {window.TF9_DATA?.userEmail || 'andres@company.io'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidenav */}
        <nav style={sidenavStyle}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '14px 0' }}>
            {NAV_GROUPS.map((group, gi) => (
              <React.Fragment key={gi}>
                {gi > 0 && <div style={{ height: 1, background: 'var(--divider)', margin: '12px 16px' }} />}
                {!collapsed && (
                  <div style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 12,
                    letterSpacing: '.3px', padding: '16px 18px 6px', whiteSpace: 'nowrap' }}>
                    {group.label}
                  </div>
                )}
                {group.links.map(link => {
                  const active = page === link.id;
                  return (
                    <a key={link.id}
                      onClick={e => { e.preventDefault(); navigate(link.id); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        color: active ? 'var(--link)' : 'var(--text)',
                        padding: collapsed ? '9px 0' : '7px 18px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        fontSize: 14, borderLeft: `2px solid ${active ? 'var(--link)' : 'transparent'}`,
                        background: active ? 'var(--blue-bg)' : 'transparent',
                        fontWeight: active ? 700 : 400,
                        cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                      title={collapsed ? link.text : undefined}
                    >
                      <span style={{ display: 'flex', flexShrink: 0, color: active ? 'var(--link)' : 'var(--text-2)' }}>
                        <Icon path={link.path} />
                      </span>
                      {!collapsed && <span>{link.text}</span>}
                    </a>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <button onClick={() => setCollapsed(c => !c)} style={{
            width: '100%', border: 'none', borderTop: '1px solid var(--divider)',
            background: 'var(--container)', color: 'var(--text-3)', cursor: 'pointer',
            padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <polyline points="9 18 15 12 9 6" />
                : <polyline points="15 18 9 12 15 6" />}
            </svg>
          </button>
        </nav>

        {/* Content */}
        <main style={{
          flex: 1, minWidth: 0,
          padding: fullWidth ? '0' : '28px 36px 80px',
          maxWidth: fullWidth ? 'none' : '1320px',
        }}>
          {!fullWidth && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)', marginBottom: 18 }}>
              {crumbs.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ color: 'var(--text-3)' }}>/</span>}
                  {c.current
                    ? <span style={{ color: 'var(--text-2)' }}>{c.text}</span>
                    : <a onClick={e => { e.preventDefault(); if (i === 0) navigate('overview'); }} style={{ color: 'var(--link)', cursor: 'pointer', textDecoration: 'none' }}>{c.text}</a>}
                </React.Fragment>
              ))}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

// TF9 Dashboard — Overview page
// Exports window.TF9Dashboard

const STATUS_TILES = [
  { status: 'running',        label: 'Running',        color: 'var(--blue)' },
  { status: 'success',        label: 'Succeeded',      color: 'var(--green)' },
  { status: 'partial_success',label: 'Partial Success',color: 'var(--amber)' },
  { status: 'failed',         label: 'Failed',         color: 'var(--red)' },
  { status: 'denied',         label: 'Denied',         color: 'var(--amber)' },
  { status: 'cancelled',      label: 'Cancelled',      color: 'var(--border-strong)' },
];

function CommandBadge({ command }) {
  const colors = {
    plan:'#1a7f37', apply:'#bc4c00', destroy:'#cf222e', init:'#0969da',
    auto:'#8250df', validate:'#0a7c86', refresh:'#57606a', state:'#9a6700',
  };
  const c = colors[command] || 'var(--text-3)';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', fontFamily:'var(--mono)',
      fontSize:'11px', fontWeight:700, padding:'1px 7px', borderRadius:'4px',
      color: c,
      background: `color-mix(in srgb, ${c} 12%, var(--container))`,
      border: `1px solid color-mix(in srgb, ${c} 28%, transparent)`,
    }}>{command}</span>
  );
}

function StatusLabel({ status }) {
  const map = {
    success: ['var(--green)', 'success'],
    partial_success: ['var(--amber)', 'partial success'],
    failed: ['var(--red)', 'failed'],
    running: ['var(--blue)', 'running'],
    cancelled: ['var(--text-2)', 'cancelled'],
    denied: ['var(--amber)', 'denied'],
  };
  const [color, label] = map[status] || ['var(--text-3)', status];
  return <span style={{ color, fontWeight:600, fontSize:'12.5px', textTransform:'capitalize' }}>{label}</span>;
}

function Dashboard({ navigate }) {
  const { runs, repos, reports } = window.TF9_DATA;
  const { relativeTime, duration } = window.TF9_UTILS;

  const counts = STATUS_TILES.map(t => ({
    ...t,
    count: runs.filter(r => r.status === t.status).length,
  }));

  const recent = runs.slice(0, 6);
  const completed = runs.filter(r => r.finishedAt);
  const success = runs.filter(r => r.status === 'success').length;
  const successRate = completed.length ? Math.round(success / completed.length * 100) : 0;
  const avgDur = completed.length
    ? Math.round(completed.reduce((s, r) => s + (new Date(r.finishedAt) - new Date(r.startedAt)) / 1000, 0) / completed.length)
    : 0;
  const sequential = runs.filter(r => !r.parallel).length;
  const parallel = runs.length - sequential;
  const changes = runs.reduce((s, r) => s + (r.add || 0) + (r.change || 0) + (r.destroy || 0), 0);

  const card = { background:'var(--container)', borderRadius:16, boxShadow:'var(--shadow-c)', marginBottom:22 };
  const cHead = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, padding:'16px 20px', borderBottom:'1px solid var(--divider)' };
  const cTitle = { fontSize:18, fontWeight:700, color:'var(--text)' };

  return (
    <div style={{ width:'100%' }}>
      {/* Page header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:20, marginBottom:22 }}>
        <div>
          <div style={{ fontSize:28, fontWeight:700, color:'var(--text)', letterSpacing:'-.3px', lineHeight:1.1 }}>Dashboard</div>
          <div style={{ color:'var(--text-2)', fontSize:14, marginTop:6 }}>
            Operational summary for tf9 — Terraform runs across your ordered repository targets.
          </div>
        </div>
        <div style={{ display:'flex', gap:10, flexShrink:0 }}>
          <button onClick={() => navigate('workspace')} style={{
            fontFamily:'var(--sans)', fontWeight:700, fontSize:14, borderRadius:20,
            padding:'4px 20px', height:34, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8,
            border:'2px solid var(--link)', background:'var(--container)', color:'var(--link)',
          }}>Open Repository Workspace</button>
          <button onClick={() => navigate('runs')} style={{
            fontFamily:'var(--sans)', fontWeight:700, fontSize:14, borderRadius:20,
            padding:'4px 20px', height:34, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8,
            border:'2px solid var(--blue)', background:'var(--blue)', color:'#fff',
          }}>Start Terraform Run</button>
        </div>
      </div>

      {/* Status tiles */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:22 }}>
        {counts.map(t => (
          <a key={t.status} onClick={e => { e.preventDefault(); navigate('runs'); }}
            style={{
              flex:'1', minWidth:128, display:'flex', flexDirection:'column', gap:2,
              background:'var(--container)', borderRadius:12, boxShadow:'var(--shadow-c)',
              padding:'14px 16px', textDecoration:'none', color:'var(--text)',
              borderTop:`3px solid ${t.color}`, cursor:'pointer',
            }}>
            <span style={{ fontSize:26, fontWeight:700, lineHeight:1.1 }}>{t.count}</span>
            <span style={{ fontSize:12.5, fontWeight:600, color:'var(--text-2)' }}>{t.label}</span>
          </a>
        ))}
        <div style={{ flexBasis:'100%', fontSize:12, color:'var(--text-3)', marginTop:-6 }}>
          Last {runs.length} runs
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(560px,1.5fr) minmax(400px,1fr)', gap:22, alignItems:'start' }}>
        {/* Recent runs */}
        <div style={{ ...card, overflow:'hidden', marginBottom:0 }}>
          <div style={cHead}>
            <div style={cTitle}>Recent runs</div>
            <a onClick={e => { e.preventDefault(); navigate('runs'); }} style={{ fontSize:13, color:'var(--link)', cursor:'pointer', textDecoration:'none' }}>View all</a>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13.5 }}>
            <thead>
              <tr>
                {['Command','Repository','Status','Started','Duration'].map(h => (
                  <th key={h} style={{ textAlign:'left', fontWeight:700, color:'var(--text)', fontSize:12,
                    padding:'10px 20px', borderBottom:'1px solid var(--divider)', background:'var(--th)',
                    position:'sticky', top:0, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id} onClick={() => navigate('runs')}
                  style={{ cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--th)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding:'10px 20px', borderBottom:'1px solid var(--divider)' }}>
                    <CommandBadge command={r.command} />
                  </td>
                  <td style={{ padding:'10px 20px', borderBottom:'1px solid var(--divider)' }}>
                    <span style={{ fontFamily:'var(--mono)', fontSize:12, display:'inline-block', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', verticalAlign:'bottom' }}>{r.repo}</span>
                  </td>
                  <td style={{ padding:'10px 20px', borderBottom:'1px solid var(--divider)' }}>
                    <StatusLabel status={r.status} />
                  </td>
                  <td style={{ padding:'10px 20px', borderBottom:'1px solid var(--divider)', color:'var(--text-2)', fontSize:12.5, whiteSpace:'nowrap' }}>
                    {relativeTime(r.startedAt)}
                  </td>
                  <td style={{ padding:'10px 20px', borderBottom:'1px solid var(--divider)', color:'var(--text-2)', fontSize:12.5 }}>
                    {r.status === 'running'
                      ? <span style={{ color:'var(--blue)', fontWeight:600 }}>in progress</span>
                      : duration(r.startedAt, r.finishedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Side panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
          {/* Execution modes */}
          <div style={card}>
            <div style={{ ...cHead, borderBottom:'none' }}><div style={cTitle}>Execution modes</div></div>
            <div style={{ padding:'4px 20px 18px' }}>
              <div style={{ height:16, display:'flex', overflow:'hidden', borderRadius:999, background:'var(--surface-3)' }}>
                <div style={{ background:'var(--blue)', flexGrow: sequential }} />
                <div style={{ background:'var(--purple)', flexGrow: parallel }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10, color:'var(--text-2)', fontSize:12 }}>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <i style={{ width:8, height:8, borderRadius:'50%', background:'var(--blue)', display:'inline-block' }} />
                  Sequential <strong style={{ color:'var(--text)' }}>{sequential}</strong>
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <i style={{ width:8, height:8, borderRadius:'50%', background:'var(--purple)', display:'inline-block' }} />
                  Parallel <strong style={{ color:'var(--text)' }}>{parallel}</strong>
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:18, paddingTop:16, borderTop:'1px solid var(--divider)' }}>
                {[
                  [successRate + '%', 'Success rate'],
                  [avgDur + 's', 'Avg. duration'],
                  [changes, 'Resource changes'],
                ].map(([val, label]) => (
                  <div key={label} style={{ display:'flex', flexDirection:'column', gap:4, padding:'12px 14px', border:'1px solid var(--divider)', borderRadius:10, background:'var(--surface-2)' }}>
                    <strong style={{ color:'var(--text)', fontSize:21, lineHeight:1.1 }}>{val}</strong>
                    <span style={{ color:'var(--text-2)', fontSize:12, lineHeight:1.3 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Resources */}
          <div style={card}>
            <div style={{ ...cHead, borderBottom:'none' }}><div style={cTitle}>Resources</div></div>
            <ul style={{ listStyle:'none', margin:0, padding:'0 20px 14px' }}>
              {[
                ['Repositories', <a onClick={e => { e.preventDefault(); navigate('repos'); }} style={{ color:'var(--link)', cursor:'pointer' }}>{repos.length}</a>],
                ['Terraform reports', <a onClick={e => { e.preventDefault(); navigate('reports'); }} style={{ color:'var(--link)', cursor:'pointer' }}>{reports.length}</a>],
                ['AWS session', <span style={{ fontFamily:'var(--mono)', fontSize:12 }}>123456789012</span>],
                ['Cost Analysis', <a onClick={e => { e.preventDefault(); navigate('cost'); }} style={{ color:'var(--link)', cursor:'pointer' }}>Open</a>],
              ].map(([label, value]) => (
                <li key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'8px 0', borderBottom:'1px solid var(--divider)', fontSize:13.5 }}>
                  <span style={{ color:'var(--text-2)' }}>{label}</span>
                  {value}
                </li>
              ))}
            </ul>
          </div>

          {/* Recent reports */}
          <div style={card}>
            <div style={cHead}>
              <div style={cTitle}>Recent reports</div>
              <a onClick={e => { e.preventDefault(); navigate('reports'); }} style={{ fontSize:13, color:'var(--link)', cursor:'pointer', textDecoration:'none' }}>View all</a>
            </div>
            <ul style={{ listStyle:'none', margin:0, padding:'0 12px 12px', maxHeight:280, overflowY:'auto' }}>
              {reports.slice(0, 8).map(rep => (
                <li key={rep.name}>
                  <a onClick={e => e.preventDefault()} style={{
                    display:'flex', alignItems:'center', gap:9, padding:'7px 8px', borderRadius:8,
                    color:'var(--text)', textDecoration:'none', cursor:'pointer',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <CommandBadge command={rep.command} />
                    <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'var(--mono)', fontSize:11.5 }}>{rep.name}</span>
                    <span style={{ color:'var(--text-3)', fontSize:12, flexShrink:0 }}>{relativeTime(rep.runAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// TF9 Run History page
// Exports window.TF9RunHistory

function RunHistory({ navigate }) {
  const { runs } = window.TF9_DATA;
  const { relativeTime, duration } = window.TF9_UTILS;
  const [selectedId, setSelectedId] = React.useState(runs[0]?.id || null);
  const [cmdFilter, setCmdFilter] = React.useState('');

  const selected = runs.find(r => r.id === selectedId);

  const filtered = cmdFilter
    ? runs.filter(r => r.command === cmdFilter || r.status === cmdFilter)
    : runs;

  const commandColors = {
    plan:'#1a7f37', apply:'#bc4c00', destroy:'#cf222e', init:'#0969da',
    auto:'#8250df', validate:'#0a7c86', refresh:'#57606a', state:'#9a6700',
  };
  const statusColors = {
    success:'var(--green)', partial_success:'var(--amber)', failed:'var(--red)',
    running:'var(--blue)', cancelled:'var(--text-2)', denied:'var(--amber)',
  };

  function CmdBadge({ cmd }) {
    const c = commandColors[cmd] || 'var(--text-3)';
    return (
      <span style={{
        fontFamily:'var(--mono)', fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:4,
        color:c, background:`color-mix(in srgb,${c} 12%,var(--container))`,
        border:`1px solid color-mix(in srgb,${c} 28%,transparent)`, whiteSpace:'nowrap',
      }}>{cmd}</span>
    );
  }

  function StatusChip({ status }) {
    const svgs = {
      running: <span style={{ width:13, height:13, border:'2px solid currentColor', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'tf9-spin .7s linear infinite' }} />,
      success: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
      failed:  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
      partial_success: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
      cancelled: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
      denied: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
    };
    const labels = { partial_success: 'Partial Success' };
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:7, fontSize:12.5, fontWeight:600, color: statusColors[status] || 'var(--text-3)' }}>
        {svgs[status]}
        {labels[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '—')}
      </span>
    );
  }

  const CMDS = ['plan','apply','destroy','init','validate'];
  const STATUSES = ['running','success','failed','partial_success','cancelled'];

  // Terminal output mock
  const termLines = selected ? [
    { cls: 'dim', text: `# Initializing provider plugins...` },
    { cls: 'plan', text: `Terraform will perform the following actions:` },
    { cls: '', text: '' },
    { cls: 'add', text: `  # aws_vpc.main will be created` },
    { cls: 'add', text: `  + resource "aws_vpc" "main" {` },
    { cls: 'add', text: `      + cidr_block = "10.0.0.0/16"` },
    { cls: 'add', text: `      + id         = (known after apply)` },
    { cls: 'add', text: `    }` },
    { cls: '', text: '' },
    { cls: 'chg', text: `  # aws_security_group.web will be updated in-place` },
    { cls: 'chg', text: `  ~ resource "aws_security_group" "web" {` },
    { cls: 'chg', text: `      ~ description = "Old" -> "Updated web SG"` },
    { cls: 'chg', text: `    }` },
    { cls: '', text: '' },
    { cls: 'plan', text: `Plan: ${selected.add || 1} to add, ${selected.change || 0} to change, ${selected.destroy || 0} to destroy.` },
    { cls: 'ok', text: selected.status === 'success' ? `Apply complete! Resources: ${selected.add || 1} added.` : '' },
  ].filter(l => l.text !== undefined) : [];

  const lineColors = { add:'var(--green)', del:'var(--red)', chg:'var(--amber)', plan:'var(--blue)', ok:'var(--green)', dim:'var(--text-3)', err:'var(--red)' };

  return (
    <div style={{ height:'calc(100vh - 56px)', display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden', fontFamily:'var(--sans)' }}>
      {/* Top bar */}
      <div style={{ flexShrink:0, padding:'24px 28px 0' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:16 }}>
          <div style={{ fontSize:26, fontWeight:700, color:'var(--text)', letterSpacing:'-.3px' }}>Run History</div>
          <button onClick={() => navigate('runs')} style={{
            fontFamily:'var(--sans)', fontWeight:700, fontSize:14, borderRadius:20,
            padding:'4px 20px', height:34, cursor:'pointer', display:'inline-flex', alignItems:'center',
            border:'2px solid var(--blue)', background:'var(--blue)', color:'#fff',
          }}>+ New Run</button>
        </div>

        {/* Filter bar */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', paddingBottom:14 }}>
          <span style={{ fontSize:13, color:'var(--text-2)', fontWeight:600 }}>Command:</span>
          {['', ...CMDS].map(c => (
            <button key={c} onClick={() => setCmdFilter(c)} style={{
              height:28, padding:'0 12px', border:'1px solid var(--border)', borderRadius:6,
              background: cmdFilter === c ? 'var(--blue-bg)' : 'var(--surface-1)',
              color: cmdFilter === c ? 'var(--blue)' : 'var(--text-2)',
              borderColor: cmdFilter === c ? 'var(--blue)' : 'var(--border)',
              fontFamily:'var(--sans)', fontSize:12, fontWeight:600, cursor:'pointer',
            }}>{c || 'All'}</button>
          ))}
          <span style={{ color:'var(--text-2)', fontSize:12, marginLeft:'auto' }}>
            {filtered.length} run{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Main split */}
      <div style={{ flex:1, display:'flex', minHeight:0, minWidth:0 }}>
        {/* Table */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, minWidth:0, overflow:'hidden' }}>
          <div style={{ flex:1, overflow:'auto', padding:'0 28px 24px', minHeight:0 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13.5 }}>
              <thead>
                <tr>
                  {['Run ID','Command','Repository','Status','Started','Duration'].map(h => (
                    <th key={h} style={{ position:'sticky', top:0, background:'var(--th)', textAlign:'left', fontWeight:700,
                      color:'var(--text)', fontSize:12, padding:'11px 16px', borderBottom:'1px solid var(--divider)', whiteSpace:'nowrap', zIndex:2 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const active = r.id === selectedId;
                  return (
                    <tr key={r.id} onClick={() => setSelectedId(r.id)}
                      style={{ cursor:'pointer', background: active ? 'var(--blue-bg)' : 'transparent', transition:'background .08s' }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--th)'; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--divider)', boxShadow: active ? 'inset 3px 0 0 var(--blue)' : 'none' }}>
                        <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                          {r.status === 'running' && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--blue)', animation:'tf9-pulse 1.1s ease-in-out infinite', display:'inline-block' }} />}
                          {r.id.slice(0, 14)}
                        </span>
                      </td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--divider)' }}><CmdBadge cmd={r.command} /></td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--divider)' }}>
                        <span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--text)' }}>{r.repo}</span>
                      </td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--divider)' }}><StatusChip status={r.status} /></td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--divider)', color:'var(--text-2)', fontSize:12.5, whiteSpace:'nowrap' }}>{relativeTime(r.startedAt)}</td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--divider)', color:'var(--text-2)', fontSize:12.5 }}>
                        {r.status === 'running' ? <span style={{ color:'var(--blue)', fontWeight:600 }}>live</span> : duration(r.startedAt, r.finishedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Split panel */}
        {selected && (
          <div style={{
            width:'42%', minWidth:380, borderLeft:'1px solid var(--border-strong)',
            background:'var(--container)', display:'flex', flexDirection:'column',
            boxShadow:'-4px 0 18px rgba(0,7,22,.05)',
          }}>
            {/* Panel header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, padding:'12px 20px', borderBottom:'1px solid var(--divider)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:11, minWidth:0 }}>
                {selected.status === 'running' && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--blue)', animation:'tf9-pulse 1.1s ease-in-out infinite', display:'inline-block' }} />}
                <span style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selected.id}</span>
                <CmdBadge cmd={selected.command} />
              </div>
              <button onClick={() => setSelectedId(null)} style={{ border:'none', background:'transparent', color:'var(--text-2)', cursor:'pointer', padding:4, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Meta strip */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 22px', padding:'12px 20px 14px', borderBottom:'1px solid var(--divider)', flexShrink:0 }}>
              {[
                ['Repository', selected.repo],
                ['Branch', selected.branch || 'main'],
                ['Status', <StatusChip key="s" status={selected.status} />],
                ['Duration', selected.status === 'running' ? 'running…' : duration(selected.startedAt, selected.finishedAt)],
                ['Changes', `+${selected.add || 0} ~${selected.change || 0} -${selected.destroy || 0}`],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <span style={{ fontSize:11, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:.4, fontWeight:600 }}>{k}</span>
                  <span style={{ fontSize:13, color:'var(--text)', fontWeight:600, fontFamily: k === 'Repository' || k === 'Branch' ? 'var(--mono)' : 'inherit' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Terminal */}
            <div style={{
              flex:1, overflow:'auto', padding:'12px 16px',
              fontFamily:'var(--mono)', fontSize:12, lineHeight:1.6, color:'var(--tc-text, #c9d1d9)',
              background: 'var(--tc-card-bg, #0b1220)', minHeight:0,
              '--tc-add':'#3fb950', '--tc-del':'#f85149', '--tc-chg':'#d29922',
              '--tc-plan':'#58a6ff', '--tc-ok':'#3fb950', '--tc-dim':'#6e7681', '--tc-err':'#ff7b72',
            }}>
              {termLines.map((line, i) => (
                <div key={i} style={{ color: lineColors[line.cls] || 'inherit', fontWeight: line.cls === 'plan' || line.cls === 'ok' ? 600 : 400 }}>
                  {line.text || '\u00A0'}
                </div>
              ))}
              {selected.status === 'running' && (
                <span style={{ display:'inline-block', width:7, height:13, background:'#58a6ff', verticalAlign:'text-bottom', animation:'tf9-blink 1s step-end infinite' }} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── App root ────────────────────────────────────────────────────────
const MODE_KEY = 'tf9-color-mode';

function WorkspacePage({ navigate }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'calc(100vh - 56px - 100px)', gap:16, color:'var(--text-2)', textAlign:'center' }}>
      <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      </svg>
      <h2 style={{ fontSize:20, fontWeight:700, color:'var(--text)', margin:0 }}>Repository Workspace</h2>
      <p style={{ margin:0, fontSize:14, maxWidth:400, lineHeight:1.6 }}>
        The workspace is where you browse repositories, edit configuration files,
        run Terraform commands, and view real-time terminal output. This view requires a live backend connection.
      </p>
      <button onClick={() => navigate('runs')} style={{ fontFamily:'var(--sans)', fontWeight:700, fontSize:14, borderRadius:20, padding:'4px 20px', height:34, cursor:'pointer', border:'2px solid var(--link)', background:'transparent', color:'var(--link)' }}>View Run History instead</button>
    </div>
  );
}

function PlaceholderPage({ title, description, icon }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'calc(100vh - 56px - 100px)', gap:16, color:'var(--text-2)', textAlign:'center' }}>
      <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
      <h2 style={{ fontSize:20, fontWeight:700, color:'var(--text)', margin:0 }}>{title}</h2>
      <p style={{ margin:0, fontSize:14, maxWidth:400, lineHeight:1.6 }}>{description}</p>
    </div>
  );
}

function TF9App() {
  const [page, setPage] = React.useState(() => (window.location.hash.replace(/^#/, '') || 'overview'));
  const [mode, setMode] = React.useState(() => {
    try { const s = localStorage.getItem(MODE_KEY); if (s === 'light' || s === 'dark' || s === 'dim') return s; } catch(e) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
    if (mode === 'dim') document.documentElement.setAttribute('data-variant', 'dim');
    else document.documentElement.removeAttribute('data-variant');
    try { localStorage.setItem(MODE_KEY, mode); } catch(e) {}
  }, [mode]);

  React.useEffect(() => { window.location.hash = page; }, [page]);
  React.useEffect(() => {
    function onHash() { setPage(window.location.hash.replace(/^#/, '') || 'overview'); }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function toggleTheme() { setMode(m => m === 'light' ? 'dark' : m === 'dark' ? 'dim' : 'light'); }

  const isFullWidth = page === 'runs';
  function renderPage() {
    switch (page) {
      case 'overview': return <Dashboard navigate={setPage} />;
      case 'runs': return <RunHistory navigate={setPage} />;
      case 'workspace': return <WorkspacePage navigate={setPage} />;
      case 'repos': return <PlaceholderPage title="Repositories" description="Manage connected Git repositories and configure Terraform root modules." icon="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />;
      case 'config': return <PlaceholderPage title="Configuration" description="Edit the tf9 configuration YAML, manage global settings, and configure AI integrations." icon="M16 18l6-6-6-6M8 6l-6 6 6 6" />;
      case 'profiles': return <PlaceholderPage title="AWS Profile Mappings" description="Map Terraform workspace environments to AWS credentials and SSO profiles." icon="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM5 21v-2a7 7 0 0 1 14 0v2" />;
      case 'reports': return <PlaceholderPage title="Terraform Reports" description="Browse and view generated Terraform plan and apply reports from past runs." icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />;
      case 'graph': return <PlaceholderPage title="Graph View" description="Visualize Terraform resource dependencies and run execution order as an interactive graph." icon="M6 5h4v4H6zM14 3h4v4h-4zM14 15h4v4h-4zM4 16h4v4H4zM10 7l4-2M8 9l7 6M8 18l6-1" />;
      case 'cost': return <PlaceholderPage title="Cost Analysis" description="Analyze estimated infrastructure costs from Terraform plans using Infracost integration." icon="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />;
      case 'logs': return <PlaceholderPage title="System Logs" description="View tf9 server logs and operational events for debugging and audit purposes." icon="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
      default: return <Dashboard navigate={setPage} />;
    }
  }

  return (
    <Shell page={page} navigate={setPage} mode={mode} toggleTheme={toggleTheme} fullWidth={isFullWidth}>
      {renderPage()}
    </Shell>
  );
}

window.TF9App = TF9App;
