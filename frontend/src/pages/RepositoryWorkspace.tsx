import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import Shell from '../Shell';
import { api, ApiError, repoGit, workspaceApi } from '../api';
import type { GitChangedFile, Paginated, Repo, WorkspaceEntry, WorkspaceFile } from '../types';
import { useNav } from '../nav';
import { parseGitDiff } from '../lib/gitDiff';
import { clampDiffWidth, resizedWidth, storedDiffWidth } from '../lib/workspaceLayout';
import { buildGitDecorationMaps, changedFilePath, type GitDecoration } from '../lib/gitStatusDecorations';
import './RepositoryWorkspace.css';

type EditorTab = WorkspaceFile & {
  savedContent: string;
  dirty: boolean;
  externalConflict: boolean;
  conflictContent?: string;
};

type WorkbenchIconName =
  | 'files' | 'source' | 'search' | 'settings' | 'folder' | 'folderOpen'
  | 'file' | 'terraform' | 'json' | 'yaml' | 'markdown' | 'code'
  | 'newFile' | 'newFolder' | 'refresh' | 'collapse' | 'terminal'
  | 'split' | 'trash' | 'maximize' | 'restore' | 'close' | 'branch'
  | 'back' | 'save' | 'repo';

const ICON_PATHS: Record<WorkbenchIconName, React.ReactNode> = {
  files: <><path d="M5 3h9l5 5v13H5z" /><path d="M14 3v5h5M3 7H1v14h13" /></>,
  source: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10M8 5h4a6 6 0 0 1 6 6v6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  folderOpen: <path d="M3 7h7l2 2h9l-2 10H2z" />,
  file: <><path d="M6 2h8l5 5v15H6z" /><path d="M14 2v6h5" /></>,
  terraform: <><path d="m5 3 6 3.5v7L5 10zM12 7l6 3.5v7L12 14zM5 11l6 3.5v7L5 18z" fill="currentColor" stroke="none" /></>,
  json: <path d="M9 3H7a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h2M15 3h2a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-2" />,
  yaml: <><path d="m4 5 4 6 4-6M8 11v7M14 5v13M20 5v13" /></>,
  markdown: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M5 15V9l3 3 3-3v6M15 12h4m-2-2v5" /></>,
  code: <path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12" />,
  newFile: <><path d="M5 2h8l5 5v15H5zM13 2v6h5M9 15h6m-3-3v6" /></>,
  newFolder: <><path d="M3 6h7l2 2h9v11H3zM12 11v5m-2.5-2.5h5" /></>,
  refresh: <><path d="M20 6v5h-5M4 18v-5h5" /><path d="M18.5 10A7 7 0 0 0 6 6.5L4 9m2 5.5A7 7 0 0 0 18 18l2-3" /></>,
  collapse: <path d="m7 7 5 5 5-5M7 14l5 5 5-5" />,
  terminal: <><path d="m5 7 4 4-4 4M11 17h7" /><rect x="2" y="3" width="20" height="18" rx="2" /></>,
  split: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M12 4v16" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7M10 11v6m4-6v6" /></>,
  maximize: <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" />,
  restore: <><rect x="5" y="5" width="14" height="14" /><path d="M8 5V2h14v14h-3" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 7v10m2-8h5a5 5 0 0 0 5-5v3" /></>,
  back: <path d="m15 18-6-6 6-6" />,
  save: <><path d="M4 3h14l2 2v16H4zM8 3v6h8V3M8 21v-8h8v8" /></>,
  repo: <><path d="M4 4h14v16H4zM8 4v16M12 8h3m-3 4h3" /></>,
};

function WorkbenchIcon({ name, className = '' }: { name: WorkbenchIconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

function fileIconName(path: string): WorkbenchIconName {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'tf' || ext === 'tfvars') return 'terraform';
  if (ext === 'json') return 'json';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  if (ext === 'md') return 'markdown';
  if (['ts', 'tsx', 'js', 'jsx', 'go', 'css', 'html', 'sh', 'zsh'].includes(ext || '')) return 'code';
  return 'file';
}

function terminalTheme(mode: 'light' | 'dark' | 'dim') {
  const light = mode === 'light';
  const dim = mode === 'dim';
  return {
    background: light ? '#ffffff' : dim ? '#22272e' : '#181818',
    foreground: light ? '#24292f' : dim ? '#adbac7' : '#cccccc',
    cursor: light ? '#24292f' : '#aeafad',
    selectionBackground: light ? '#add6ff' : dim ? '#34506d' : '#264f78',
    black: light ? '#24292f' : '#000000', red: light ? '#cf222e' : '#f14c4c',
    green: light ? '#1a7f37' : '#23d18b', yellow: light ? '#9a6700' : '#f5f543',
    blue: light ? '#0969da' : '#3b8eea', magenta: light ? '#8250df' : '#d670d6',
    cyan: light ? '#1b7c83' : '#29b8db', white: light ? '#6e7781' : '#e5e5e5',
    brightBlack: light ? '#57606a' : '#666666', brightRed: light ? '#a40e26' : '#f14c4c',
    brightGreen: light ? '#116329' : '#23d18b', brightYellow: light ? '#7d4e00' : '#f5f543',
    brightBlue: light ? '#0550ae' : '#3b8eea', brightMagenta: light ? '#6639ba' : '#d670d6',
    brightCyan: light ? '#0a6b75' : '#29b8db', brightWhite: light ? '#24292f' : '#e5e5e5',
  };
}

function basename(path: string) {
  return path.split('/').pop() || path;
}

function dirname(path: string) {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

function statusLabel(xy: string) {
  if (xy === '??') return 'U';
  return xy.trim()[0] || 'M';
}

const DIFF_WIDTH_KEY = 'tfops-workspace-diff-width';

function initialDiffWidth() {
  if (typeof localStorage === 'undefined') return 380;
  return storedDiffWidth(localStorage.getItem(DIFF_WIDTH_KEY), window.innerWidth);
}

function EntryNode({
  repo, entry, depth, selected, refreshKey, fileDecorations, directoryDecorations, onOpen, onContext,
}: {
  repo: string;
  entry: WorkspaceEntry;
  depth: number;
  selected: string;
  refreshKey: number;
  fileDecorations: Map<string, GitDecoration>;
  directoryDecorations: Map<string, number>;
  onOpen: (path: string) => void;
  onContext: (entry: WorkspaceEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fileDecoration = entry.isDir ? undefined : fileDecorations.get(entry.path);
  const changedDescendants = entry.isDir ? directoryDecorations.get(entry.path) : undefined;

  useEffect(() => {
    if (!open || !entry.isDir) return;
    setLoading(true);
    workspaceApi.tree(repo, entry.path)
      .then(result => setChildren(result.entries))
      .finally(() => setLoading(false));
  }, [entry.isDir, entry.path, open, refreshKey, repo]);

  return (
    <>
      <button
        className={`rw-tree-row${selected === entry.path ? ' selected' : ''}${fileDecoration ? ` git-${fileDecoration.kind}` : ''}${changedDescendants ? ' git-folder-changed' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        title={`${entry.path}${fileDecoration ? ` — ${fileDecoration.title}` : changedDescendants ? ` — ${changedDescendants} changed file${changedDescendants === 1 ? '' : 's'}` : ''}`}
        onClick={() => entry.isDir ? setOpen(value => !value) : onOpen(entry.path)}
        onContextMenu={(event) => {
          event.preventDefault();
          onContext(entry);
        }}
      >
        <span className="rw-chevron">{entry.isDir ? (open ? '⌄' : '›') : ''}</span>
        <WorkbenchIcon
          name={entry.isDir ? (open ? 'folderOpen' : 'folder') : fileIconName(entry.path)}
          className={`rw-file-icon rw-file-icon-${entry.isDir ? 'folder' : fileIconName(entry.path)}`}
        />
        <span className="rw-entry-name">{entry.name}</span>
        {fileDecoration && <span className={`rw-git-decoration git-${fileDecoration.kind}`}>{fileDecoration.label}</span>}
        {changedDescendants && <span className="rw-git-folder-count">{changedDescendants}</span>}
      </button>
      {open && loading && <div className="rw-tree-loading" style={{ paddingLeft: 28 + depth * 16 }}>Loading…</div>}
      {open && children.map(child => (
        <EntryNode
          key={child.path}
          repo={repo}
          entry={child}
          depth={depth + 1}
          selected={selected}
          refreshKey={refreshKey}
          fileDecorations={fileDecorations}
          directoryDecorations={directoryDecorations}
          onOpen={onOpen}
          onContext={onContext}
        />
      ))}
    </>
  );
}

function WorkspacePicker() {
  const { navigate } = useNav();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Paginated<Repo>>('/api/repos')
      .then(result => setRepos(result.items.filter(repo => !repo.disabled)))
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load repositories.'));
  }, []);

  return (
    <Shell>
      <div className="workspace-picker">
        <div className="workspace-picker-hero">
          <div className="workspace-picker-mark"><WorkbenchIcon name="code" /></div>
          <div>
            <h1>Workspace</h1>
            <p>Open a repository in the full-screen editor and terminal.</p>
          </div>
        </div>
        {error && <div className="alert">{error}</div>}
        <div className="workspace-picker-grid">
          {repos.map(repo => (
            <button key={repo.name} className="workspace-repo-card" onClick={() => navigate({ id: 'workspace', name: repo.name })}>
              <span className="workspace-repo-icon"><WorkbenchIcon name="repo" /></span>
              <span className="workspace-repo-copy">
                <strong>{repo.name}</strong>
                <span>{repo.path}</span>
              </span>
              <span className="workspace-repo-open">Open ›</span>
            </button>
          ))}
          {repos.length === 0 && !error && (
            <div className="workspace-picker-empty">
              No enabled repositories. Add one from <button onClick={() => navigate({ id: 'repos' })}>Repositories</button>.
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function LiveTerminal({
  repo, directory, mode, maximized, onToggleMaximize, onCollapse,
}: {
  repo: string;
  directory: string;
  mode: 'light' | 'dark' | 'dim';
  maximized: boolean;
  onToggleMaximize: () => void;
  onCollapse: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'closed'>('connecting');
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!hostRef.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"SFMono-Regular", "Cascadia Code", "Liberation Mono", Consolas, Menlo, monospace',
      fontSize: 12,
      fontWeight: 'normal',
      fontWeightBold: '600',
      letterSpacing: 0,
      lineHeight: 1.3,
      scrollback: 5000,
      theme: terminalTheme(mode),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(hostRef.current);
    fit.fit();
    terminal.focus();
    terminalRef.current = terminal;

    const socket = new WebSocket(workspaceApi.terminalUrl(repo, directory));
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    socket.onopen = () => {
      setConnection('connected');
      socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    };
    socket.onmessage = event => {
      if (event.data instanceof ArrayBuffer) terminal.write(new Uint8Array(event.data));
      else terminal.write(String(event.data));
    };
    socket.onclose = () => setConnection('closed');
    socket.onerror = () => setConnection('closed');
    const input = terminal.onData(data => {
      if (socket.readyState === WebSocket.OPEN) socket.send(new TextEncoder().encode(data));
    });
    const resizeTerminal = () => {
      fit.fit();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    };
    const observer = new ResizeObserver(resizeTerminal);
    observer.observe(hostRef.current);
    return () => {
      observer.disconnect();
      input.dispose();
      socket.close();
      terminal.dispose();
      terminalRef.current = null;
      socketRef.current = null;
    };
  }, [directory, generation, repo]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = terminalTheme(mode);
  }, [mode]);

  return (
    <section className="rw-terminal">
      <div className="rw-panel-head">
        <div className="rw-terminal-tabs">
          <button className="active"><WorkbenchIcon name="terminal" /> TERMINAL</button>
          <button>OUTPUT</button>
          <button>PROBLEMS</button>
        </div>
        <span className={`rw-connection ${connection}`}>{connection}</span>
        <span className="rw-spacer" />
        <button className="rw-icon-button" title="New terminal" onClick={() => {
          setConnection('connecting');
          setGeneration(value => value + 1);
        }}><WorkbenchIcon name="terminal" /><span className="rw-terminal-shell">{directory ? basename(directory) : 'shell'}</span>＋</button>
        <button className="rw-icon-button" title={maximized ? 'Restore panel' : 'Maximize panel'} onClick={onToggleMaximize}>
          <WorkbenchIcon name={maximized ? 'restore' : 'maximize'} />
        </button>
        <button className="rw-icon-button" title="Clear terminal" onClick={() => terminalRef.current?.clear()}><WorkbenchIcon name="trash" /></button>
        <button className="rw-icon-button" title="Close panel" onClick={onCollapse}><WorkbenchIcon name="close" /></button>
      </div>
      <div ref={hostRef} className="rw-terminal-host" />
    </section>
  );
}

function Workbench({ name }: { name: string }) {
  const { mode, navigate } = useNav();
  const [fullScreen, setFullScreen] = useState(false);
  const [rootEntries, setRootEntries] = useState<WorkspaceEntry[]>([]);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState('');
  const [changedFiles, setChangedFiles] = useState<GitChangedFile[]>([]);
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [behind, setBehind] = useState(0);
  const [diff, setDiff] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(250);
  const [diffWidth, setDiffWidth] = useState(initialDiffWidth);
  const [terminalHeight, setTerminalHeight] = useState(250);
  const [sidebarView, setSidebarView] = useState<'explorer' | 'source'>('explorer');
  const [diffVisible, setDiffVisible] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [terminalDirectory, setTerminalDirectory] = useState('');
  const [terminalSession, setTerminalSession] = useState(0);
  const activeTab = tabs.find(tab => tab.path === activePath);
  const dirty = tabs.some(tab => tab.dirty);
  const monacoTheme = mode === 'light' ? 'vs' : 'vs-dark';
  const diffLines = useMemo(() => parseGitDiff(diff), [diff]);

  const updateDiffWidth = useCallback((value: number) => {
    const next = clampDiffWidth(value, typeof window === 'undefined' ? 1440 : window.innerWidth);
    setDiffWidth(next);
    try {
      localStorage.setItem(DIFF_WIDTH_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleDiffPanel() {
    setDiffVisible(visible => !visible);
  }

  const refresh = useCallback(async () => {
    try {
      const tree = await workspaceApi.tree(name);
      setRootEntries(tree.entries);
      const [statusResult, branchResult] = await Promise.allSettled([
        repoGit.status(name),
        repoGit.branches(name),
      ]);
      if (statusResult.status === 'fulfilled') {
        setChangedFiles(statusResult.value.changedFiles);
        setBranch(statusResult.value.branch);
        setBehind(statusResult.value.behind);
      } else {
        setChangedFiles([]);
        setBranch('');
        setBehind(0);
      }
      setBranches(branchResult.status === 'fulfilled' ? branchResult.value : []);
      setRefreshKey(value => value + 1);
      if (activePath) {
        workspaceApi.diff(name, activePath).then(result => setDiff(result.diff)).catch(() => setDiff(''));
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh repository.');
    }
  }, [activePath, name]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const events = new EventSource(workspaceApi.eventsUrl(name));
    const onChange = () => {
      void refresh();
      setTabs(current => {
        current.forEach(tab => {
          workspaceApi.file(name, tab.path).then(latest => {
            setTabs(openTabs => openTabs.map(open => {
              if (open.path !== tab.path || open.revision === latest.revision) return open;
              if (open.dirty) return { ...open, externalConflict: true, conflictContent: latest.content };
              return { ...latest, savedContent: latest.content, dirty: false, externalConflict: false };
            }));
          }).catch(() => {});
        });
        return current;
      });
    };
    events.addEventListener('change', onChange);
    return () => events.close();
  }, [name, refresh]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const openFile = useCallback(async (path: string) => {
    const existing = tabs.find(tab => tab.path === path);
    if (existing) {
      setActivePath(path);
      return;
    }
    try {
      const file = await workspaceApi.file(name, path);
      setTabs(current => [...current, { ...file, savedContent: file.content, dirty: false, externalConflict: false }]);
      setActivePath(path);
      const result = await workspaceApi.diff(name, path);
      setDiff(result.diff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file.');
    }
  }, [name, tabs]);

  const saveTab = useCallback(async (force = false) => {
    if (!activeTab || activeTab.readOnly) return;
    setBusy(true);
    try {
      const result = await workspaceApi.save(
        name, activeTab.path, activeTab.content, activeTab.revision, force,
      );
      setTabs(current => current.map(tab => tab.path === activeTab.path
        ? { ...tab, revision: result.revision, savedContent: tab.content, dirty: false, externalConflict: false }
        : tab));
      setError('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setTabs(current => current.map(tab => tab.path === activeTab.path
          ? { ...tab, externalConflict: true }
          : tab));
      } else {
        setError(err instanceof Error ? err.message : 'Could not save file.');
      }
    } finally {
      setBusy(false);
    }
  }, [activeTab, name, refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveTab();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '`') {
        event.preventDefault();
        setTerminalOpen(value => !value);
        setTerminalMaximized(false);
      }
      if (event.key === 'Escape' && fullScreen) {
        setFullScreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullScreen, saveTab]);

  async function reloadActive() {
    if (!activeTab) return;
    const file = await workspaceApi.file(name, activeTab.path);
    setTabs(current => current.map(tab => tab.path === activeTab.path
      ? { ...file, savedContent: file.content, dirty: false, externalConflict: false }
      : tab));
  }

  async function compareActive() {
    if (!activeTab) return;
    const latest = await workspaceApi.file(name, activeTab.path);
    setTabs(current => current.map(tab => tab.path === activeTab.path
      ? { ...tab, externalConflict: true, conflictContent: latest.content }
      : tab));
  }

  function closeTab(path: string) {
    const tab = tabs.find(item => item.path === path);
    if (tab?.dirty && !window.confirm(`Discard unsaved changes in ${basename(path)}?`)) return;
    const index = tabs.findIndex(item => item.path === path);
    const next = tabs.filter(item => item.path !== path);
    setTabs(next);
    if (activePath === path) setActivePath(next[Math.max(0, index - 1)]?.path || '');
  }

  async function createEntry(type: 'file' | 'directory') {
    const parent = activeTab ? dirname(activeTab.path) : '';
    const value = window.prompt(`New ${type} path`, parent ? `${parent}/` : '');
    if (!value) return;
    try {
      await workspaceApi.create(name, value, type);
      await refresh();
      if (type === 'file') await openFile(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not create ${type}.`);
    }
  }

  async function editEntry(entry: WorkspaceEntry) {
    const actions = entry.isDir ? '"terminal", "rename", or "delete"' : '"rename" or "delete"';
    const action = window.prompt(`Enter ${actions}`, entry.isDir ? 'terminal' : 'rename');
    if (action === 'terminal' && entry.isDir) {
      setTerminalDirectory(entry.path);
      setTerminalSession(value => value + 1);
      setTerminalOpen(true);
      setTerminalMaximized(false);
      return;
    }
    if (action === 'rename') {
      const destination = window.prompt('New path', entry.path);
      if (!destination || destination === entry.path) return;
      try {
        await workspaceApi.move(name, entry.path, destination);
        setTabs(current => current.map(tab => tab.path === entry.path ? { ...tab, path: destination } : tab));
        if (activePath === entry.path) setActivePath(destination);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not rename entry.');
      }
    } else if (action === 'delete' && window.confirm(`Delete ${entry.path}${entry.isDir ? ' recursively' : ''}?`)) {
      try {
        await workspaceApi.remove(name, entry.path);
        setTabs(current => current.filter(tab => tab.path !== entry.path && !tab.path.startsWith(`${entry.path}/`)));
        if (activePath === entry.path || activePath.startsWith(`${entry.path}/`)) setActivePath('');
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete entry.');
      }
    }
  }

  async function checkout(nextBranch: string) {
    if (nextBranch === branch) return;
    if (dirty) {
      setError('Save or discard editor changes before switching branches.');
      return;
    }
    setBusy(true);
    try {
      await repoGit.checkout(name, nextBranch);
      setTabs([]);
      setActivePath('');
      setDiff('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch branch.');
    } finally {
      setBusy(false);
    }
  }

  const changeByPath = useMemo(
    () => new Map(changedFiles.map(file => [changedFilePath(file.path), file.xy])),
    [changedFiles],
  );
  const gitDecorations = useMemo(() => buildGitDecorationMaps(changedFiles), [changedFiles]);

  function startHorizontalResize(
    event: React.PointerEvent,
    value: number,
    setter: (value: number) => void,
    direction: 1 | -1,
    min: number,
    max: number,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const onMove = (moveEvent: PointerEvent) => {
      setter(resizedWidth(value, startX, moveEvent.clientX, direction, min, max));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startTerminalResize(event: React.PointerEvent) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = terminalHeight;
    const onMove = (moveEvent: PointerEvent) => {
      setTerminalHeight(Math.max(140, Math.min(520, startHeight + startY - moveEvent.clientY)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const layoutStyle = {
    '--rw-explorer-width': `${explorerWidth}px`,
    '--rw-diff-width': `${diffWidth}px`,
  } as CSSProperties;

  const workbench = (
    <div className={`rw-workbench rw-theme-${mode}${fullScreen ? ' is-fullscreen' : ''}${terminalMaximized ? ' terminal-maximized' : ''}`} style={layoutStyle}>
      <header className="rw-titlebar">
        <div className="rw-app-mark">tf</div>
        <div className="rw-workbench-name"><strong>{name}</strong><span>Workspace</span></div>
        <div className="rw-git-toolbar">
          <span className="rw-git-label"><WorkbenchIcon name="branch" /> Git</span>
          <select value={branch} disabled={busy} aria-label="Git branch" onChange={event => void checkout(event.target.value)}>
            {branches.length === 0 && <option>{branch || 'no branch'}</option>}
            {branches.map(item => <option key={item}>{item}</option>)}
          </select>
          <button disabled={busy || behind === 0} title="Pull changes" onClick={async () => {
            setBusy(true);
            try { await repoGit.pull(name); await refresh(); } catch (err) {
              setError(err instanceof Error ? err.message : 'Pull failed.');
            } finally { setBusy(false); }
          }}>Pull{behind > 0 ? ` (${behind})` : ''}</button>
          <button disabled={busy} onClick={() => void refresh()}><WorkbenchIcon name="refresh" /> Refresh</button>
          <button className={sidebarView === 'source' ? 'active' : ''} onClick={() => setSidebarView('source')}><WorkbenchIcon name="source" /> Changes ({changedFiles.length})</button>
          <button
            className={diffVisible ? 'active' : ''}
            aria-label="Toggle Git diff"
            aria-pressed={diffVisible}
            title="Toggle Git diff"
            onClick={toggleDiffPanel}
          >
            <WorkbenchIcon name="split" /> Diff
          </button>
        </div>
        <div className="rw-command-center"><WorkbenchIcon name="search" /><span>{name}</span></div>
        <div className="rw-titlebar-actions">
          <button className="rw-fullscreen-button" title={fullScreen ? 'Exit full screen' : 'Open full screen'} onClick={() => setFullScreen(value => !value)}>
            <WorkbenchIcon name={fullScreen ? 'restore' : 'maximize'} /><span>{fullScreen ? 'Exit full screen' : 'Full screen'}</span>
          </button>
        </div>
      </header>

      {error && <div className="rw-error">{error}<button onClick={() => setError('')}><WorkbenchIcon name="close" /></button></div>}

      <div className="rw-body">
        <nav className="rw-activitybar">
          <div>
            <button className={sidebarView === 'explorer' ? 'active' : ''} title="Explorer" onClick={() => setSidebarView('explorer')}><WorkbenchIcon name="files" /></button>
            <button className={sidebarView === 'source' ? 'active' : ''} title="Source Control" onClick={() => setSidebarView('source')}>
              <WorkbenchIcon name="source" />
              {changedFiles.length > 0 && <span className="rw-activity-badge">{changedFiles.length}</span>}
            </button>
            <button title="Search"><WorkbenchIcon name="search" /></button>
          </div>
          <div>
            <button title="Repositories" onClick={() => navigate({ id: 'repos' })}><WorkbenchIcon name="repo" /></button>
            <button title="Settings"><WorkbenchIcon name="settings" /></button>
          </div>
        </nav>

        <aside className="rw-sidebar">
          <div className="rw-side-title">
            <span>{sidebarView === 'explorer' ? 'EXPLORER' : 'SOURCE CONTROL'}</span>
            <button title="More actions">•••</button>
          </div>
          {sidebarView === 'explorer' ? (
            <>
              <div className="rw-repo-heading">
                <span className="rw-disclosure">⌄</span><strong>{name.toUpperCase()}</strong>
                <span className="rw-spacer" />
                <button title="New file" onClick={() => void createEntry('file')}><WorkbenchIcon name="newFile" /></button>
                <button title="New folder" onClick={() => void createEntry('directory')}><WorkbenchIcon name="newFolder" /></button>
                <button title="Refresh" onClick={() => void refresh()}><WorkbenchIcon name="refresh" /></button>
                <button title="Collapse folders"><WorkbenchIcon name="collapse" /></button>
              </div>
              <div className="rw-tree">
                {rootEntries.map(entry => (
                  <EntryNode
                    key={entry.path}
                    repo={name}
                    entry={entry}
                    depth={0}
                  selected={activePath}
                  refreshKey={refreshKey}
                  fileDecorations={gitDecorations.filesByPath}
                  directoryDecorations={gitDecorations.directories}
                    onOpen={path => void openFile(path)}
                    onContext={entry => void editEntry(entry)}
                  />
                ))}
              </div>
              <div className="rw-explorer-hint">Right-click folders to open a terminal, rename, or delete.</div>
              <button className="rw-section-heading" onClick={() => setSidebarView('source')}>
                <span>›</span> SOURCE CONTROL <b>{changedFiles.length || ''}</b>
              </button>
            </>
          ) : (
            <>
              <div className="rw-scm-toolbar">
                <span>{changedFiles.length} change{changedFiles.length === 1 ? '' : 's'}</span>
                <button title="Refresh" onClick={() => void refresh()}><WorkbenchIcon name="refresh" /></button>
              </div>
              <div className="rw-changes">
                {changedFiles.length === 0 && <div className="rw-empty-small">No source control changes.</div>}
                {changedFiles.map(file => {
                  const path = changedFilePath(file.path);
                  return (
                    <button key={`${file.xy}:${file.path}`} onClick={() => void openFile(path)}>
                      <WorkbenchIcon name={fileIconName(path)} className={`rw-file-icon rw-file-icon-${fileIconName(path)}`} />
                      <span className="rw-change-copy"><strong>{basename(path)}</strong><small>{dirname(path)}</small></span>
                      <span className="rw-status">{statusLabel(file.xy)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </aside>

        <div className="rw-resizer rw-resizer-vertical" onPointerDown={event => startHorizontalResize(event, explorerWidth, setExplorerWidth, 1, 180, 480)} />

        <section className="rw-workspace-main">
          <div className="rw-editor-row">
            <main className="rw-editor-area">
              <div className="rw-tabs">
                {tabs.map(tab => (
                  (() => {
                    const decoration = gitDecorations.filesByPath.get(tab.path);
                    return (
                  <button key={tab.path} className={tab.path === activePath ? 'active' : ''} onClick={() => setActivePath(tab.path)} title={tab.path}>
                    <WorkbenchIcon name={fileIconName(tab.path)} className={`rw-file-icon rw-file-icon-${fileIconName(tab.path)}`} />
                    <span>{basename(tab.path)}</span>
                    {decoration && <span className={`rw-tab-git git-${decoration.kind}`} title={decoration.title}>{decoration.label}</span>}
                    {tab.dirty && <i className="rw-dirty-dot" />}
                    <span className="rw-tab-close" onClick={event => { event.stopPropagation(); closeTab(tab.path); }}><WorkbenchIcon name="close" /></span>
                  </button>
                    );
                  })()
                ))}
              </div>
              {activeTab ? (
                <>
                  <div className="rw-breadcrumbs">
                    <span>{name}</span>
                    {activeTab.path.split('/').map((part, index, parts) => (
                      <span key={`${part}-${index}`}>› {index === parts.length - 1 && <WorkbenchIcon name={fileIconName(activeTab.path)} />} {part}</span>
                    ))}
                    {gitDecorations.filesByPath.get(activeTab.path) && (
                      <span className={`rw-active-git git-${gitDecorations.filesByPath.get(activeTab.path)!.kind}`}>
                        {gitDecorations.filesByPath.get(activeTab.path)!.label} {gitDecorations.filesByPath.get(activeTab.path)!.title}
                      </span>
                    )}
                    <span className="rw-spacer" />
                    {activeTab.readOnly && <span className="rw-readonly">Read only</span>}
                    <button title="Save" disabled={!activeTab.dirty || activeTab.readOnly || busy} onClick={() => void saveTab()}><WorkbenchIcon name="save" /></button>
                  </div>
                  {activeTab.externalConflict && (
                    <div className="rw-conflict">
                      This file changed outside the editor.
                      <button onClick={() => void compareActive()}>Compare</button>
                      <button onClick={() => void reloadActive()}>Reload</button>
                      <button onClick={() => void saveTab(true)}>Overwrite</button>
                    </div>
                  )}
                  {activeTab.binary ? (
                    <div className="rw-empty">Binary files cannot be displayed.</div>
                  ) : activeTab.externalConflict && activeTab.conflictContent !== undefined ? (
                    <DiffEditor original={activeTab.conflictContent} modified={activeTab.content} language={activeTab.language} theme={monacoTheme}
                      options={{ readOnly: true, automaticLayout: true, fontFamily: 'var(--tfops-font-mono)', fontSize: 13 }} />
                  ) : (
                    <Editor path={activeTab.path} value={activeTab.content} language={activeTab.language} theme={monacoTheme}
                      options={{
                        readOnly: activeTab.readOnly, minimap: { enabled: true }, automaticLayout: true,
                        fontFamily: 'var(--tfops-font-mono)', fontSize: 13, scrollBeyondLastLine: false,
                        renderLineHighlight: 'all', smoothScrolling: true, padding: { top: 8 },
                      }}
                      onChange={value => setTabs(current => current.map(tab => tab.path === activeTab.path
                        ? { ...tab, content: value ?? '', dirty: (value ?? '') !== tab.savedContent } : tab))}
                    />
                  )}
                </>
              ) : (
                <div className="rw-welcome">
                  <div className="rw-welcome-logo">tf</div>
                  <h2>{name}</h2>
                  <p>Select a file from Explorer or open the terminal.</p>
                  <div><kbd>Ctrl</kbd><kbd>P</kbd><span>Quick open</span></div>
                  <div><kbd>Ctrl</kbd><kbd>S</kbd><span>Save file</span></div>
                  <div><kbd>Ctrl</kbd><kbd>`</kbd><span>Toggle terminal</span></div>
                </div>
              )}
            </main>

            {diffVisible && (
              <>
                <div className="rw-resizer rw-resizer-vertical rw-diff-resizer" title="Drag to resize Git diff"
                  onPointerDown={event => startHorizontalResize(event, diffWidth, updateDiffWidth, 1, 220, 900)}
                  onDoubleClick={() => updateDiffWidth(380)} />
                <aside className="rw-diff">
                  <div className="rw-panel-head">
                    <strong>GIT DIFF</strong>
                    <span className="rw-diff-size">{diffWidth}px</span>
                    <span className="rw-spacer" />
                    <button aria-label="Narrower" title="Narrower" onClick={() => updateDiffWidth(diffWidth - 80)}>−</button>
                    <button aria-label="Wider" title="Wider" onClick={() => updateDiffWidth(diffWidth + 80)}>＋</button>
                    <button title="Close Git diff" onClick={() => setDiffVisible(false)}><WorkbenchIcon name="close" /></button>
                  </div>
                  <div className="rw-diff-code">
                    {diff
                      ? diffLines.map((line, index) => (
                          <div key={index} className={`rw-diff-line rw-diff-${line.kind}`}>
                            <span className="rw-diff-number">{index + 1}</span>
                            <span className="rw-diff-mark">
                              {line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '-' : ' '}
                            </span>
                            <span className="rw-diff-text">{line.text || ' '}</span>
                          </div>
                        ))
                      : <div className="rw-diff-empty">No diff for the selected file.</div>}
                  </div>
                </aside>
              </>
            )}
          </div>

          {terminalOpen ? (
            <div className="rw-terminal-wrap" style={{ height: terminalMaximized ? '100%' : terminalHeight, flexBasis: terminalMaximized ? '100%' : terminalHeight }}>
              {!terminalMaximized && <div className="rw-resizer rw-resizer-horizontal" onPointerDown={startTerminalResize} />}
              <LiveTerminal key={`${terminalDirectory}:${terminalSession}`} repo={name} directory={terminalDirectory} mode={mode} maximized={terminalMaximized} onToggleMaximize={() => setTerminalMaximized(value => !value)} onCollapse={() => {
                setTerminalOpen(false);
                setTerminalMaximized(false);
              }} />
            </div>
          ) : (
            <button className="rw-open-terminal" onClick={() => setTerminalOpen(true)}><WorkbenchIcon name="terminal" /> Terminal</button>
          )}
        </section>
      </div>

      <footer className="rw-statusbar">
        <span className="rw-status-branch"><WorkbenchIcon name="branch" />
          <select value={branch} disabled={busy} aria-label="Git branch" onChange={event => void checkout(event.target.value)}>
            {branches.length === 0 && <option>{branch || 'no branch'}</option>}
            {branches.map(item => <option key={item}>{item}</option>)}
          </select>
        </span>
        <button disabled={busy || behind === 0} title="Pull changes" onClick={async () => {
          setBusy(true);
          try { await repoGit.pull(name); await refresh(); } catch (err) {
            setError(err instanceof Error ? err.message : 'Pull failed.');
          } finally { setBusy(false); }
        }}>{behind > 0 ? `↓ ${behind} Pull` : '✓ synced'}</button>
        <span className="rw-spacer" />
        <span>{activeTab?.language || 'Plain Text'}</span>
        <span>UTF-8</span>
        <span>LF</span>
        <span>{dirty ? '● Unsaved' : '✓ Saved'}</span>
      </footer>
    </div>
  );

  return fullScreen ? workbench : <Shell fullWidth><div className="rw-embedded">{workbench}</div></Shell>;
}

export default function RepositoryWorkspace({ name }: { name?: string }) {
  return name ? <Workbench name={name} /> : <WorkspacePicker />;
}
