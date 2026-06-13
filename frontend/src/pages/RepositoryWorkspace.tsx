import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import Shell from '../Shell';
import { api, ApiError, repoGit, workspaceApi, workspaceChatApi } from '../api';
import type {
  ActiveBranches, GitChangedFile, GitCommit, Paginated, ReconcileStatus, Repo, WorkspaceChatEvent, WorkspaceChatMessage,
  WorkspaceChatMode, WorkspaceEntry, WorkspaceFile,
} from '../types';
import { buildReconcilePrompt } from '../lib/reconcilePrompt';
import { takePendingChatSeed } from '../lib/pendingChat';
import { stripAnsi } from '../lib/runStatus';
import { useNav } from '../nav';
import { parseGitDiff } from '../lib/gitDiff';
import { clampDiffWidth, resizedWidth, storedDiffWidth } from '../lib/workspaceLayout';
import { buildGitDecorationMaps, changedFilePath, type GitDecoration } from '../lib/gitStatusDecorations';
import {
  addWorkspaceRepository,
  closeWorkspaceRepository,
  normalizeWorkspaceTabs,
  readWorkspaceTabs,
  WORKSPACE_TABS_KEY,
  type WorkspaceTabsState,
} from '../lib/workspaceTabs';
import {
  readWorkspaceSession,
  workspaceSessionKey,
  type WorkspaceSessionState,
} from '../lib/workspaceSession';
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
  | 'split' | 'trash' | 'stop' | 'rename' | 'maximize' | 'restore' | 'close' | 'branch'
  | 'back' | 'save' | 'repo' | 'ai';

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
  stop: <rect x="5" y="5" width="14" height="14" rx="1" />,
  rename: <><path d="m4 16-.5 4.5L8 20 19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></>,
  maximize: <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" />,
  restore: <><rect x="5" y="5" width="14" height="14" /><path d="M8 5V2h14v14h-3" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 7v10m2-8h5a5 5 0 0 0 5-5v3" /></>,
  back: <path d="m15 18-6-6 6-6" />,
  save: <><path d="M4 3h14l2 2v16H4zM8 3v6h8V3M8 21v-8h8v8" /></>,
  repo: <><path d="M4 4h14v16H4zM8 4v16M12 8h3m-3 4h3" /></>,
  ai: <><path d="m12 2 1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4z" /><path d="m18.5 14 .8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8zM5 15l.7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7z" /></>,
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

const DIFF_WIDTH_KEY = 'tf9-workspace-diff-width';

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

function WorkspacePicker({
  repos, error, onOpen,
}: {
  repos: Repo[];
  error: string;
  onOpen: (name: string) => void;
}) {
  const { navigate } = useNav();

  return (
    <div className="workspace-picker">
      <div className="workspace-picker-hero">
        <div className="workspace-picker-mark"><WorkbenchIcon name="code" /></div>
        <div>
          <h1>Workspace</h1>
          <p>Open repositories in persistent workspace tabs.</p>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="workspace-picker-grid">
        {repos.map(repo => (
          <button key={repo.name} className="workspace-repo-card" onClick={() => onOpen(repo.name)}>
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
  );
}

type TerminalSession = {
  id: number;
  directory: string;
};

function TerminalInstance({
  repo, directory, mode, active, clearSignal, onConnectionChange,
}: {
  repo: string;
  directory: string;
  mode: 'light' | 'dark' | 'dim';
  active: boolean;
  clearSignal: number;
  onConnectionChange: (connection: 'connecting' | 'connected' | 'closed') => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

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
    if (active) terminal.focus();
    terminalRef.current = terminal;
    fitRef.current = fit;

    const socket = new WebSocket(workspaceApi.terminalUrl(repo, directory));
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    socket.onopen = () => {
      onConnectionChange('connected');
      socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    };
    socket.onmessage = event => {
      if (event.data instanceof ArrayBuffer) terminal.write(new Uint8Array(event.data));
      else terminal.write(String(event.data));
    };
    socket.onclose = () => onConnectionChange('closed');
    socket.onerror = () => onConnectionChange('closed');
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
      fitRef.current = null;
    };
  }, [directory, onConnectionChange, repo]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = terminalTheme(mode);
  }, [mode]);

  useEffect(() => {
    if (clearSignal > 0) terminalRef.current?.clear();
  }, [clearSignal]);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => {
      fitRef.current?.fit();
      const terminal = terminalRef.current;
      const socket = socketRef.current;
      if (terminal && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  return <div ref={hostRef} className="rw-terminal-host" hidden={!active} />;
}

function LiveTerminal({
  repo, sessions, activeSessionId, mode, active, maximized, onSelectSession, onNewSession,
  onTerminateSession, onToggleMaximize, onCollapse,
}: {
  repo: string;
  sessions: TerminalSession[];
  activeSessionId: number;
  mode: 'light' | 'dark' | 'dim';
  active: boolean;
  maximized: boolean;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onTerminateSession: (id: number) => void;
  onToggleMaximize: () => void;
  onCollapse: () => void;
}) {
  const [connections, setConnections] = useState<Record<number, 'connecting' | 'connected' | 'closed'>>({});
  const [clearSignals, setClearSignals] = useState<Record<number, number>>({});
  const activeSession = sessions.find(session => session.id === activeSessionId) ?? sessions[0];
  const activeConnection = connections[activeSession?.id] ?? 'connecting';
  const connectionHandlers = useRef(new Map<number, (connection: 'connecting' | 'connected' | 'closed') => void>());

  function connectionHandler(id: number) {
    const existing = connectionHandlers.current.get(id);
    if (existing) return existing;
    const handler = (connection: 'connecting' | 'connected' | 'closed') => {
      setConnections(current => current[id] === connection ? current : { ...current, [id]: connection });
    };
    connectionHandlers.current.set(id, handler);
    return handler;
  }

  return (
    <section className="rw-terminal">
      <div className="rw-panel-head">
        <div className="rw-terminal-tabs">
          {sessions.map((session, index) => (
            <button
              key={session.id}
              className={`rw-terminal-session-tab${session.id === activeSession?.id ? ' active' : ''}`}
              aria-selected={session.id === activeSession?.id}
              onClick={() => onSelectSession(session.id)}
            >
              <WorkbenchIcon name="terminal" />
              <span className="rw-terminal-shell">{session.directory ? basename(session.directory) : 'shell'} {index + 1}</span>
            </button>
          ))}
        </div>
        <span className={`rw-connection ${activeConnection}`}>{activeConnection}</span>
        <span className="rw-spacer" />
        <button className="rw-icon-button" aria-label="New terminal" title="New terminal" onClick={onNewSession}>
          <WorkbenchIcon name="terminal" />＋
        </button>
        <button
          className="rw-icon-button rw-terminal-terminate"
          aria-label="Terminate terminal"
          title="Terminate terminal"
          disabled={!activeSession}
          onClick={() => activeSession && onTerminateSession(activeSession.id)}
        >
          <WorkbenchIcon name="stop" />
        </button>
        <button className="rw-icon-button" title={maximized ? 'Restore panel' : 'Maximize panel'} onClick={onToggleMaximize}>
          <WorkbenchIcon name={maximized ? 'restore' : 'maximize'} />
        </button>
        <button className="rw-icon-button" title="Clear terminal" onClick={() => {
          if (!activeSession) return;
          setClearSignals(current => ({ ...current, [activeSession.id]: (current[activeSession.id] ?? 0) + 1 }));
        }}><WorkbenchIcon name="trash" /></button>
        <button className="rw-icon-button" title="Close panel" onClick={onCollapse}><WorkbenchIcon name="close" /></button>
      </div>
      {sessions.map(session => (
        <TerminalInstance
          key={session.id}
          repo={repo}
          directory={session.directory}
          mode={mode}
          active={active && session.id === activeSession?.id}
          clearSignal={clearSignals[session.id] ?? 0}
          onConnectionChange={connectionHandler(session.id)}
        />
      ))}
    </section>
  );
}

type ChatToolActivity = {
  tool: string;
  summary: string;
};

function ChatInline({ text }: { text: string }) {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function ChatProse({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="rw-chat-prose">
      {lines.map((line, index) => {
        if (!line.trim()) return <span className="rw-chat-space" key={index} />;
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) return <strong className="rw-chat-heading" key={index}><ChatInline text={heading[2]} /></strong>;
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        if (bullet) return <span className="rw-chat-list-item" key={index}><ChatInline text={bullet[1]} /></span>;
        return <span className="rw-chat-line" key={index}><ChatInline text={line} /></span>;
      })}
    </div>
  );
}

function ChatContent({ content, live = false }: { content: string; live?: boolean }) {
  const cleanContent = stripAnsi(content);
  const blocks: React.ReactNode[] = [];
  const fence = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;
  let offset = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(cleanContent)) !== null) {
    if (match.index > offset) {
      blocks.push(<ChatProse key={`text-${offset}`} text={cleanContent.slice(offset, match.index)} />);
    }
    blocks.push(
      <div className="rw-chat-code" key={`code-${match.index}`}>
        <div className="rw-chat-code-head">
          <span>{match[1].trim() || 'code'}</span>
        </div>
        <pre><code>{match[2].replace(/\n$/, '')}</code></pre>
      </div>,
    );
    offset = fence.lastIndex;
  }

  if (offset < cleanContent.length) {
    blocks.push(<ChatProse key={`text-${offset}`} text={cleanContent.slice(offset)} />);
  }
  if (blocks.length === 0 && cleanContent) blocks.push(<ChatProse key="text" text={cleanContent} />);

  return <div className="rw-chat-content">{blocks}{live && <i className="rw-chat-cursor" />}</div>;
}

function WorkspaceChat({ repo, active, seed, onSeedConsumed }: {
  repo: string;
  active: boolean;
  seed?: string;
  onSeedConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<WorkspaceChatMessage[]>([]);
  const [mode, setMode] = useState<WorkspaceChatMode>('review');
  const [available, setAvailable] = useState(false);
  const [authError, setAuthError] = useState('');
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState('');
  const [liveText, setLiveText] = useState('');
  const [tools, setTools] = useState<ChatToolActivity[]>([]);
  const [error, setError] = useState('');
  const streamRef = useRef<EventSource | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Prefill the input when a drift-reconcile prompt is handed in from the
  // Reconcile panel. The user reviews and sends it (we don't auto-send).
  useEffect(() => {
    if (seed) {
      setDraft(seed);
      onSeedConsumed?.();
    }
  }, [seed, onSeedConsumed]);

  const loadState = useCallback(async () => {
    const state = await workspaceChatApi.state(repo);
    setMessages(state.messages ?? []);
    setMode(state.mode);
    setAvailable(state.available);
    setAuthError(state.authError ?? '');
    setRunning(state.running);
    return state;
  }, [repo]);

  const connectStream = useCallback((turnId: string) => {
    streamRef.current?.close();
    setRunning(true);
    setLiveText('');
    setTools([]);
    setError('');
    const stream = new EventSource(workspaceChatApi.streamUrl(repo, turnId));
    streamRef.current = stream;
    stream.onmessage = event => {
      const update = JSON.parse(event.data) as WorkspaceChatEvent;
      if (update.type === 'delta' && update.delta) {
        setLiveText(current => current + update.delta);
      } else if (update.type === 'tool') {
        setTools(current => [...current, {
          tool: update.tool || 'Tool',
          summary: update.summary || update.tool || 'Working',
        }]);
      } else if (update.type === 'error') {
        setError(update.message || 'Claude Code failed.');
      } else if (update.type === 'done') {
        stream.close();
        streamRef.current = null;
        setRunning(false);
        setLiveText('');
        setTools([]);
        void loadState().catch(err => setError(err instanceof Error ? err.message : 'Could not refresh chat.'));
      }
    };
    stream.onerror = () => {
      if (streamRef.current !== stream) return;
      stream.close();
      streamRef.current = null;
      setRunning(false);
      setError('The Claude response stream closed unexpectedly.');
    };
  }, [loadState, repo]);

  useEffect(() => {
    let cancelled = false;
    loadState()
      .then(state => {
        if (!cancelled && state.running && state.activeTurnId) connectStream(state.activeTurnId);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load AI chat.');
      });
    return () => {
      cancelled = true;
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [connectStream, loadState]);

  useEffect(() => {
    if (!active) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [active, liveText, messages, tools]);

  async function sendMessage() {
    const message = draft.trim();
    if (!message || running || !available) return;
    setDraft('');
    setMessages(current => [...current, {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    }]);
    try {
      const result = await workspaceChatApi.send(repo, message);
      connectStream(result.turnId);
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : 'Could not start Claude Code.');
      void loadState().catch(() => {});
    }
  }

  async function changeMode(next: WorkspaceChatMode) {
    try {
      await workspaceChatApi.setMode(repo, next);
      setMode(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change AI mode.');
    }
  }

  async function resetChat() {
    if (messages.length > 0 && !window.confirm('Start a new AI chat for this repository?')) return;
    try {
      await workspaceChatApi.reset(repo);
      setMessages([]);
      setLiveText('');
      setTools([]);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset AI chat.');
    }
  }

  return (
    <section className="rw-chat">
      <div className="rw-chat-toolbar">
        <span className={`rw-chat-status ${available ? 'ready' : 'unavailable'}`}>
          {available ? 'Claude connected' : 'Claude unavailable'}
        </span>
        <span className="rw-spacer" />
        <label className="rw-chat-mode" title="Review plans changes. Auto apply lets Claude edit workspace files.">
          <span>{mode === 'review' ? 'Review' : 'Auto apply'}</span>
          <input
            type="checkbox"
            checked={mode === 'autoApply'}
            disabled={running}
            onChange={event => void changeMode(event.target.checked ? 'autoApply' : 'review')}
          />
          <i />
        </label>
        <button disabled={running} onClick={() => void resetChat()}>New chat</button>
      </div>
      {!available && authError && <div className="rw-chat-notice">{authError}</div>}
      {error && <div className="rw-chat-error">{error}<button onClick={() => setError('')}>×</button></div>}
      <div className="rw-chat-messages" aria-live="polite">
        {messages.length === 0 && !running && (
          <div className="rw-chat-empty">
            <WorkbenchIcon name="ai" />
            <strong>Ask Claude about this workspace</strong>
            <span>Review code, explain Terraform, or request repository changes.</span>
          </div>
        )}
        {messages.map(message => (
          <article key={message.id} className={`rw-chat-message ${message.role}`}>
            <header>
              <span className="rw-chat-avatar">{message.role === 'user' ? 'Y' : 'C'}</span>
              <span>{message.role === 'user' ? 'You' : 'Claude'}</span>
            </header>
            <ChatContent content={message.content} />
          </article>
        ))}
        {running && (
          <article className="rw-chat-message assistant live">
            <header>
              <span className="rw-chat-avatar">C</span>
              <span>Claude</span>
              <em>Working</em>
            </header>
            {tools.map((tool, index) => (
              <div className="rw-chat-tool" key={`${tool.tool}-${index}`}>
                <WorkbenchIcon name={tool.tool === 'Edit' || tool.tool === 'Write' ? 'save' : 'terminal'} />
                <span><strong>{tool.tool}</strong>{tool.summary}</span>
              </div>
            ))}
            <ChatContent content={liveText} live />
          </article>
        )}
        <div ref={endRef} />
      </div>
      <div className="rw-chat-compose">
        <textarea
          value={draft}
          disabled={!available}
          aria-label="Message Claude"
          placeholder={available ? `Ask about ${repo}…` : 'Claude Code login required'}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
        />
        {running ? (
          <button className="stop" onClick={() => void workspaceChatApi.cancel(repo).catch(err => {
            setError(err instanceof Error ? err.message : 'Could not stop response.');
          })}>Stop</button>
        ) : (
          <button disabled={!draft.trim() || !available} onClick={() => void sendMessage()}>Send</button>
        )}
        <small>{mode === 'review' ? 'Plans only; workspace writes are blocked.' : 'Claude may edit files in this repository.'}</small>
      </div>
    </section>
  );
}

type GitOperation = 'rebase' | 'cherry-pick';

function GitOperationsModal({
  repo, currentBranch, branches, blocked, onClose, onComplete,
}: {
  repo: string;
  currentBranch: string;
  branches: string[];
  blocked: string;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [operation, setOperation] = useState<GitOperation>('rebase');
  const candidates = useMemo(
    () => branches.filter(item => item !== currentBranch),
    [branches, currentBranch],
  );
  const [selectedBranch, setSelectedBranch] = useState(candidates[0] ?? '');
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommits, setSelectedCommits] = useState<string[]>([]);
  const [previewCommit, setPreviewCommit] = useState('');
  const [commitPatch, setCommitPatch] = useState('');
  const [loadingPatch, setLoadingPatch] = useState(false);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');

  useEffect(() => {
    if (candidates.includes(selectedBranch)) return;
    setSelectedBranch(candidates[0] ?? '');
  }, [candidates, selectedBranch]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !running) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, running]);

  useEffect(() => {
    if (operation !== 'cherry-pick' || !selectedBranch || !currentBranch) {
      setCommits([]);
      setSelectedCommits([]);
      setPreviewCommit('');
      setCommitPatch('');
      return;
    }
    let cancelled = false;
    setLoadingCommits(true);
    setError('');
    repoGit.commits(repo, currentBranch, selectedBranch)
      .then(result => {
        if (cancelled) return;
        setCommits(result);
        setSelectedCommits([]);
        setPreviewCommit('');
        setCommitPatch('');
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load commits.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCommits(false);
      });
    return () => { cancelled = true; };
  }, [currentBranch, operation, repo, selectedBranch]);

  useEffect(() => {
    if (!previewCommit) {
      setCommitPatch('');
      return;
    }
    let cancelled = false;
    setLoadingPatch(true);
    repoGit.commit(repo, previewCommit)
      .then(result => {
        if (!cancelled) setCommitPatch(result.patch);
      })
      .catch(err => {
        if (!cancelled) setCommitPatch(err instanceof Error ? err.message : 'Could not load commit changes.');
      })
      .finally(() => {
        if (!cancelled) setLoadingPatch(false);
      });
    return () => { cancelled = true; };
  }, [previewCommit, repo]);

  async function execute() {
    if (!selectedBranch || running) return;
    if (operation === 'cherry-pick' && selectedCommits.length === 0) return;
    const action = operation === 'rebase'
      ? `Rebase ${currentBranch} onto ${selectedBranch}?`
      : `Cherry-pick ${selectedCommits.length} commit${selectedCommits.length === 1 ? '' : 's'} onto ${currentBranch}?`;
    if (!window.confirm(action)) return;
    setRunning(true);
    setError('');
    setOutput('');
    try {
      const orderedCommits = commits
        .filter(commit => selectedCommits.includes(commit.sha))
        .reverse()
        .map(commit => commit.sha);
      const result = operation === 'rebase'
        ? await repoGit.rebase(repo, selectedBranch)
        : await repoGit.cherryPick(repo, orderedCommits);
      setOutput((result.output || '').trim());
      await onComplete();
      if (result.error) {
        setError(`${result.error}. Resolve the Git state in the workspace terminal, then refresh.`);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Git ${operation} failed.`);
      await onComplete();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="overlay show rw-git-ops-overlay" onClick={event => {
      if (event.target === event.currentTarget && !running) onClose();
    }}>
      <div className="modal rw-git-ops-modal" role="dialog" aria-modal="true" aria-label="Git operations">
        <div className="modal-head">Git operations</div>
        <div className="modal-body">
          <div className="rw-git-ops-current">Current branch <strong>{currentBranch || 'unknown'}</strong></div>
          <div className="rw-git-ops-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={operation === 'rebase'}
              className={operation === 'rebase' ? 'active' : ''}
              onClick={() => {
                setOperation('rebase');
                setError('');
                setOutput('');
              }}
            >Rebase</button>
            <button
              role="tab"
              aria-selected={operation === 'cherry-pick'}
              className={operation === 'cherry-pick' ? 'active' : ''}
              onClick={() => {
                setOperation('cherry-pick');
                setError('');
                setOutput('');
              }}
            >Cherry-pick</button>
          </div>

          {blocked && <div className="rw-git-ops-warning">{blocked}</div>}
          {error && <div className="rw-git-ops-error">{error}</div>}

          <label className="rw-git-ops-label">
            {operation === 'rebase' ? 'Rebase onto branch' : 'Source branch'}
            <select
              aria-label={operation === 'rebase' ? 'Rebase onto branch' : 'Cherry-pick source branch'}
              value={selectedBranch}
              disabled={running}
              onChange={event => setSelectedBranch(event.target.value)}
            >
              {candidates.length === 0 && <option value="">No other branches</option>}
              {candidates.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          {operation === 'rebase' ? (
            <p className="rw-git-ops-help">
              Replays commits from <strong>{currentBranch}</strong> on top of <strong>{selectedBranch || 'the selected branch'}</strong>.
            </p>
          ) : (
            <div className="rw-commit-picker">
              <div className="rw-commit-picker-head">
                <span>Commits not in {currentBranch}</span>
                {commits.length > 0 && <button onClick={() => {
                  if (selectedCommits.length === commits.length) {
                    setSelectedCommits([]);
                    setPreviewCommit('');
                  } else {
                    setSelectedCommits(commits.map(commit => commit.sha));
                    setPreviewCommit(commits[0].sha);
                  }
                }}>{selectedCommits.length === commits.length ? 'Clear' : 'Select all'}</button>}
              </div>
              {loadingCommits ? (
                <div className="rw-git-ops-empty">Loading commits…</div>
              ) : commits.length === 0 ? (
                <div className="rw-git-ops-empty">No commits are available from this branch.</div>
              ) : commits.map(commit => (
                <label className="rw-commit-row" key={commit.sha}>
                  <input
                    type="checkbox"
                    checked={selectedCommits.includes(commit.sha)}
                    disabled={running}
                    onChange={event => {
                      const checked = event.target.checked;
                      setSelectedCommits(current => {
                        const next = checked
                          ? [...current, commit.sha]
                          : current.filter(sha => sha !== commit.sha);
                        if (checked) setPreviewCommit(commit.sha);
                        else if (previewCommit === commit.sha) setPreviewCommit(next[0] ?? '');
                        return next;
                      });
                    }}
                  />
                  <code>{commit.shortSha}</code>
                  <span><strong>{commit.message}</strong><small>{commit.author} · {commit.date}</small></span>
                </label>
              ))}
              {previewCommit && (
                <section className="rw-commit-preview" aria-label="Selected commit changes">
                  <header>Selected commit changes</header>
                  {loadingPatch
                    ? <div className="rw-git-ops-empty">Loading changes…</div>
                    : <pre>{commitPatch}</pre>}
                </section>
              )}
            </div>
          )}
          {output && <pre className="rw-git-ops-output">{output}</pre>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-normal" disabled={running} onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!selectedBranch || running ||
              (operation === 'cherry-pick' && selectedCommits.length === 0)}
            onClick={() => void execute()}
          >
            {running ? 'Running…' : operation === 'rebase' ? 'Rebase branch' : 'Cherry-pick selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReconcileModal({
  repo, blocked, onClose, onComplete, onAskAI,
}: {
  repo: string;
  blocked: string;
  onClose: () => void;
  onComplete: () => Promise<void>;
  onAskAI: (status: ReconcileStatus) => void;
}) {
  const [status, setStatus] = useState<ReconcileStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await repoGit.reconcile(repo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reconcile status.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !running) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, running]);

  async function run(action: 'rebase' | 'cherry-pick' | 'promote') {
    if (!status || running) return;
    const ref = status.integrationRef || status.integrationBranch;
    const confirmMsg = action === 'rebase'
      ? `Rebase ${status.currentBranch} onto ${ref}?`
      : action === 'cherry-pick'
        ? `Cherry-pick ${status.behindCommits?.length ?? 0} commit(s) from ${ref} onto ${status.currentBranch}?`
        : `Merge ${status.currentBranch} into ${status.integrationBranch} and push?`;
    if (!window.confirm(confirmMsg)) return;
    setRunning(true);
    setError('');
    setOutput('');
    try {
      let result: { output?: string; error?: string };
      if (action === 'rebase') {
        result = await repoGit.rebase(repo, ref);
      } else if (action === 'cherry-pick') {
        // Apply oldest-first: ListCommitsBetween returns newest-first.
        const shas = (status.behindCommits ?? []).map(c => c.Hash).reverse();
        result = await repoGit.cherryPick(repo, shas);
      } else {
        result = await repoGit.promote(repo);
      }
      setOutput((result.output || '').trim());
      await onComplete();
      if (result.error) {
        setError(`${result.error}. Resolve the Git state in the workspace terminal, then refresh.`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Git ${action} failed.`);
      await onComplete();
    } finally {
      setRunning(false);
    }
  }

  const behind = status?.behind ?? 0;
  const ahead = status?.ahead ?? 0;

  return (
    <div className="overlay show rw-git-ops-overlay" onClick={event => {
      if (event.target === event.currentTarget && !running) onClose();
    }}>
      <div className="modal rw-git-ops-modal" role="dialog" aria-modal="true" aria-label="Reconcile branch">
        <div className="modal-head">Reconcile branch</div>
        <div className="modal-body">
          {loading ? (
            <div className="rw-git-ops-empty">Checking integration branch…</div>
          ) : !status?.hasIntegration ? (
            <div className="rw-git-ops-warning">
              No integration branch found on origin for <strong>{status?.integrationBranch}</strong>.
              Configure <code>integration_branch</code> for this repository, or push it to origin.
            </div>
          ) : (
            <>
              <div className="rw-reconcile-summary">
                <span><strong>{status.currentBranch}</strong> vs <strong>{status.integrationRef}</strong></span>
                <span className={behind > 0 ? 'rw-reconcile-badge warn' : 'rw-reconcile-badge ok'}>{behind} behind</span>
                <span className="rw-reconcile-badge">{ahead} ahead</span>
              </div>

              {behind > 0 ? (
                <p className="rw-git-ops-help">
                  Your branch is missing {behind} commit{behind === 1 ? '' : 's'} that are already on the
                  integration branch — applying now would revert that deployed work. Reconcile first.
                </p>
              ) : ahead > 0 ? (
                <p className="rw-git-ops-help">
                  Your branch is up to date and has {ahead} commit{ahead === 1 ? '' : 's'} not yet on
                  <strong> {status.integrationBranch}</strong>. After you apply, promote so the integration
                  branch reflects what's deployed.
                </p>
              ) : (
                <p className="rw-git-ops-help">Up to date with <strong>{status.integrationRef}</strong>. Nothing to reconcile.</p>
              )}

              {blocked && <div className="rw-git-ops-warning">{blocked}</div>}
              {error && <div className="rw-git-ops-error">{error}</div>}

              {behind > 0 && (status.behindCommits?.length ?? 0) > 0 && (
                <div className="rw-commit-picker">
                  <div className="rw-commit-picker-head"><span>Commits to reconcile (on {status.integrationBranch}, missing here)</span></div>
                  {(status.behindCommits ?? []).map(commit => (
                    <div className="rw-commit-row rw-reconcile-commit" key={commit.Hash}>
                      <code>{commit.Hash.slice(0, 7)}</code>
                      <span><strong>{commit.Subject}</strong><small>{commit.Author} · {commit.Date}</small></span>
                    </div>
                  ))}
                </div>
              )}
              {output && <pre className="rw-git-ops-output">{output}</pre>}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-normal" disabled={running} onClick={onClose}>Close</button>
          {status?.hasIntegration && behind > 0 && (
            <>
              <button className="btn btn-normal" disabled={running || !!blocked} onClick={() => void run('cherry-pick')}>
                Cherry-pick missing
              </button>
              <button className="btn btn-normal" disabled={running} onClick={() => onAskAI(status)}>
                Reconcile with AI
              </button>
              <button className="btn btn-primary" disabled={running || !!blocked} onClick={() => void run('rebase')}>
                {running ? 'Running…' : `Rebase onto ${status.integrationBranch}`}
              </button>
            </>
          )}
          {status?.hasIntegration && behind === 0 && ahead > 0 && (
            <button className="btn btn-primary" disabled={running || !!blocked} onClick={() => void run('promote')}>
              {running ? 'Running…' : `Promote to ${status.integrationBranch}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceEntryModal({
  entry, onClose, onTerminal, onRename, onDelete,
}: {
  entry: WorkspaceEntry;
  onClose: () => void;
  onTerminal: () => void;
  onRename: (destination: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [view, setView] = useState<'actions' | 'rename' | 'delete'>('actions');
  const [destination, setDestination] = useState(entry.path);
  const [working, setWorking] = useState(false);
  const [modalError, setModalError] = useState('');
  const canRename = destination.trim() !== '' && destination.trim() !== entry.path;
  const title = view === 'rename'
    ? `Rename ${entry.isDir ? 'folder' : 'file'}`
    : view === 'delete'
      ? `Delete ${entry.isDir ? 'folder' : 'file'}`
      : `Manage ${entry.isDir ? 'folder' : 'file'}`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !working) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, working]);

  async function submitRename() {
    if (!canRename || working) return;
    setWorking(true);
    setModalError('');
    try {
      await onRename(destination.trim());
      onClose();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not rename entry.');
      setWorking(false);
    }
  }

  async function submitDelete() {
    if (working) return;
    setWorking(true);
    setModalError('');
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not delete entry.');
      setWorking(false);
    }
  }

  return (
    <div
      className="overlay show rw-entry-modal-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !working) onClose();
      }}
    >
      <div
        className="modal rw-entry-modal"
        role="dialog"
        aria-modal="true"
        aria-label={view === 'actions' ? 'Workspace item actions' : title}
      >
        <header className="rw-entry-modal-head">
          <span className={`rw-entry-modal-icon ${view === 'delete' ? 'danger' : ''}`}>
            <WorkbenchIcon name={view === 'delete' ? 'trash' : entry.isDir ? 'folder' : 'file'} />
          </span>
          <div>
            <h2>{title}</h2>
            <code title={entry.path}>{entry.path}</code>
          </div>
          <button
            className="rw-entry-modal-close"
            aria-label="Close"
            disabled={working}
            onClick={onClose}
          >
            <WorkbenchIcon name="close" />
          </button>
        </header>

        {view === 'actions' && (
          <div className="rw-entry-action-list">
            {entry.isDir && (
              <button onClick={onTerminal}>
                <span><WorkbenchIcon name="terminal" /></span>
                <span><strong>Open terminal</strong><small>Start a shell in this folder</small></span>
                <b>›</b>
              </button>
            )}
            <button onClick={() => setView('rename')}>
              <span><WorkbenchIcon name="rename" /></span>
              <span><strong>Rename</strong><small>Move this item to a new path</small></span>
              <b>›</b>
            </button>
            <button className="danger" onClick={() => setView('delete')}>
              <span><WorkbenchIcon name="trash" /></span>
              <span><strong>Delete</strong><small>{entry.isDir ? 'Remove this folder and its contents' : 'Permanently remove this file'}</small></span>
              <b>›</b>
            </button>
          </div>
        )}

        {view === 'rename' && (
          <form className="rw-entry-modal-form" onSubmit={event => {
            event.preventDefault();
            void submitRename();
          }}>
            <label>
              New path
              <input
                autoFocus
                value={destination}
                disabled={working}
                spellCheck={false}
                onFocus={event => event.currentTarget.select()}
                onChange={event => setDestination(event.target.value)}
              />
            </label>
            <p>Enter a path relative to the repository root.</p>
            {modalError && <div className="rw-entry-modal-error">{modalError}</div>}
            <footer>
              <button type="button" className="btn btn-normal" disabled={working} onClick={() => {
                setModalError('');
                setView('actions');
              }}>Back</button>
              <button type="submit" className="btn btn-primary" disabled={!canRename || working}>
                {working ? 'Renaming…' : 'Rename'}
              </button>
            </footer>
          </form>
        )}

        {view === 'delete' && (
          <div className="rw-entry-delete">
            <div className="rw-entry-delete-warning">
              <WorkbenchIcon name="trash" />
              <div>
                <strong>This action cannot be undone.</strong>
                <p>
                  {entry.isDir
                    ? 'The folder and all files and folders inside it will be permanently deleted.'
                    : 'This file will be permanently deleted from the repository workspace.'}
                </p>
              </div>
            </div>
            {modalError && <div className="rw-entry-modal-error">{modalError}</div>}
            <footer>
              <button type="button" className="btn btn-normal" disabled={working} onClick={() => {
                setModalError('');
                setView('actions');
              }}>Back</button>
              <button type="button" className="btn btn-danger" disabled={working} onClick={() => void submitDelete()}>
                {working ? 'Deleting…' : 'Delete permanently'}
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}

function Workbench({
  name, active, fullScreen, onToggleFullScreen, onDirtyChange,
}: {
  name: string;
  active: boolean;
  fullScreen: boolean;
  onToggleFullScreen: () => void;
  onDirtyChange: (name: string, dirty: boolean) => void;
}) {
  const { mode, navigate } = useNav();
  const initialSession = useMemo<WorkspaceSessionState>(() => {
    try {
      return readWorkspaceSession(localStorage.getItem(workspaceSessionKey(name)));
    } catch {
      return readWorkspaceSession(null);
    }
  }, [name]);
  const editorLayoutRef = useRef<{ layout: () => void } | null>(null);
  const [rootEntries, setRootEntries] = useState<WorkspaceEntry[]>([]);
  const [tabs, setTabs] = useState<EditorTab[]>(() => initialSession.tabs.map(tab => ({
    ...tab, externalConflict: false,
  })));
  const [activePath, setActivePath] = useState(initialSession.activePath);
  const [changedFiles, setChangedFiles] = useState<GitChangedFile[]>([]);
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [behind, setBehind] = useState(0);
  const [diff, setDiff] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gitOperationsOpen, setGitOperationsOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState('');
  const [entryModal, setEntryModal] = useState<WorkspaceEntry | null>(null);
  const [explorerWidth, setExplorerWidth] = useState(250);
  const [diffWidth, setDiffWidth] = useState(initialDiffWidth);
  const [terminalHeight, setTerminalHeight] = useState(250);
  const [sidebarView, setSidebarView] = useState<'explorer' | 'source'>('explorer');
  const [diffVisible, setDiffVisible] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'chat' | 'diff'>('chat');
  const [terminalOpen, setTerminalOpen] = useState(initialSession.terminalOpen);
  const [terminalMaximized, setTerminalMaximized] = useState(initialSession.terminalMaximized);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>(initialSession.terminalSessions);
  const [activeTerminalId, setActiveTerminalId] = useState(initialSession.activeTerminalId);
  const nextTerminalId = useRef(Math.max(0, ...initialSession.terminalSessions.map(session => session.id)) + 1);
  const activeTab = tabs.find(tab => tab.path === activePath);
  const dirty = tabs.some(tab => tab.dirty);
  const monacoTheme = mode === 'light' ? 'vs' : 'vs-dark';
  const diffLines = useMemo(() => parseGitDiff(diff), [diff]);
  const gitOperationBlocked = dirty
    ? 'Save or discard Monaco editor changes before running Git operations.'
    : changedFiles.length > 0
      ? 'Commit, stash, or discard working-tree changes before running Git operations.'
      : '';

  // A "Reconcile with AI" click in the live terminal stashes a prompt and
  // navigates here. Pick it up once on mount, open the chat panel, and seed it.
  useEffect(() => {
    const seed = takePendingChatSeed(name);
    if (seed) {
      setRightPanelTab('chat');
      setDiffVisible(true);
      setChatSeed(seed);
    }
  }, [name]);

  function openTerminal(directory = '') {
    const session = { id: nextTerminalId.current, directory };
    nextTerminalId.current += 1;
    setTerminalSessions(current => [...current, session]);
    setActiveTerminalId(session.id);
    setTerminalOpen(true);
    setTerminalMaximized(false);
  }

  function terminateTerminal(id: number) {
    const index = terminalSessions.findIndex(session => session.id === id);
    const remaining = terminalSessions.filter(session => session.id !== id);
    setTerminalSessions(remaining);
    if (remaining.length === 0) {
      setActiveTerminalId(-1);
      setTerminalOpen(false);
      setTerminalMaximized(false);
      return;
    }
    if (activeTerminalId === id) {
      setActiveTerminalId(remaining[Math.min(Math.max(index, 0), remaining.length - 1)].id);
    }
  }

  useEffect(() => {
    onDirtyChange(name, dirty);
  }, [dirty, name, onDirtyChange]);

  useEffect(() => {
    try {
      localStorage.setItem(workspaceSessionKey(name), JSON.stringify({
        version: 1,
        tabs: tabs.map(({ externalConflict: _externalConflict, conflictContent: _conflictContent, ...tab }) => tab),
        activePath,
        terminalSessions,
        activeTerminalId,
        terminalOpen,
        terminalMaximized,
      } satisfies WorkspaceSessionState));
    } catch {
      /* ignore unavailable or full storage */
    }
  }, [
    activePath, activeTerminalId, name, tabs, terminalMaximized, terminalOpen, terminalSessions,
  ]);

  useEffect(() => {
    if (initialSession.tabs.length === 0) return;
    let cancelled = false;
    Promise.all(initialSession.tabs.map(async (stored): Promise<EditorTab | null> => {
      try {
        const latest = await workspaceApi.file(name, stored.path);
        if (!stored.dirty) {
          return { ...latest, savedContent: latest.content, dirty: false, externalConflict: false } satisfies EditorTab;
        }
        if (latest.revision === stored.revision) {
          return { ...stored, externalConflict: false } satisfies EditorTab;
        }
        return {
          ...stored,
          externalConflict: true,
          conflictContent: latest.content,
        } satisfies EditorTab;
      } catch {
        return null;
      }
    })).then(restored => {
      if (cancelled) return;
      const available = restored.filter((tab): tab is EditorTab => tab !== null);
      setTabs(available);
      setActivePath(current => available.some(tab => tab.path === current) ? current : available[0]?.path ?? '');
    });
    return () => { cancelled = true; };
  }, [initialSession.tabs, name]);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => editorLayoutRef.current?.layout());
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

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
    if (diffVisible && rightPanelTab === 'diff') {
      setDiffVisible(false);
      return;
    }
    setRightPanelTab('diff');
    setDiffVisible(true);
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
      if (!active) return;
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
        onToggleFullScreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, fullScreen, onToggleFullScreen, saveTab]);

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

  function editEntry(entry: WorkspaceEntry) {
    setEntryModal(entry);
  }

  async function renameEntry(entry: WorkspaceEntry, destination: string) {
    await workspaceApi.move(name, entry.path, destination);
    const childPrefix = `${entry.path}/`;
    setTabs(current => current.map(tab => {
      if (tab.path === entry.path) return { ...tab, path: destination };
      if (tab.path.startsWith(childPrefix)) {
        return { ...tab, path: `${destination}/${tab.path.slice(childPrefix.length)}` };
      }
      return tab;
    }));
    setActivePath(current => {
      if (current === entry.path) return destination;
      if (current.startsWith(childPrefix)) return `${destination}/${current.slice(childPrefix.length)}`;
      return current;
    });
    await refresh();
  }

  async function deleteEntry(entry: WorkspaceEntry) {
    await workspaceApi.remove(name, entry.path);
    const childPrefix = `${entry.path}/`;
    setTabs(current => current.filter(tab => tab.path !== entry.path && !tab.path.startsWith(childPrefix)));
    setActivePath(current => current === entry.path || current.startsWith(childPrefix) ? '' : current);
    await refresh();
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

  async function refreshAfterGitOperation() {
    const restored = await Promise.all(tabs.map(async (tab): Promise<EditorTab | null> => {
      try {
        const latest = await workspaceApi.file(name, tab.path);
        return { ...latest, savedContent: latest.content, dirty: false, externalConflict: false };
      } catch {
        return null;
      }
    }));
    const available = restored.filter((tab): tab is EditorTab => tab !== null);
    setTabs(available);
    setActivePath(current => available.some(tab => tab.path === current) ? current : available[0]?.path ?? '');
    await refresh();
  }

  // askAIReconcile builds a structured drift prompt — seeded with the reconcile
  // status and the active/open branches — and hands it to the AI chat so Claude
  // can locate the reconciling code across branches and propose/execute the fix.
  async function askAIReconcile(status: ReconcileStatus) {
    let active: ActiveBranches | null = null;
    try {
      active = await repoGit.activeBranches(name);
    } catch {
      active = null;
    }
    setReconcileOpen(false);
    setRightPanelTab('chat');
    setDiffVisible(true);
    setChatSeed(buildReconcilePrompt(name, status, active));
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
    <div className={`rw-workbench rw-theme-${mode}${terminalMaximized ? ' terminal-maximized' : ''}`} style={layoutStyle}>
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
          <button title="Rebase or cherry-pick" onClick={() => setGitOperationsOpen(true)}>
            <WorkbenchIcon name="branch" /> Git ops
          </button>
          <button title="Reconcile with the integration branch" onClick={() => setReconcileOpen(true)}>
            <WorkbenchIcon name="branch" /> Reconcile
          </button>
          <button
            className={diffVisible ? 'active' : ''}
            aria-label="Toggle Git diff"
            aria-pressed={diffVisible}
            title="Toggle Git diff"
            onClick={toggleDiffPanel}
          >
            <WorkbenchIcon name="split" /> Diff
          </button>
          <button
            className={diffVisible && rightPanelTab === 'chat' ? 'active' : ''}
            title="Open AI Chat"
            onClick={() => {
              setRightPanelTab('chat');
              setDiffVisible(true);
            }}
          >
            <WorkbenchIcon name="ai" /> AI
          </button>
        </div>
        <div className="rw-command-center"><WorkbenchIcon name="search" /><span>{name}</span></div>
        <div className="rw-titlebar-actions">
          <button className="rw-fullscreen-button" title={fullScreen ? 'Exit full screen' : 'Open full screen'} onClick={onToggleFullScreen}>
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
                      onMount={editor => { editorLayoutRef.current = editor; }}
                      options={{ readOnly: true, automaticLayout: true, fontFamily: 'var(--tf9-font-mono)', fontSize: 13 }} />
                  ) : (
                    <Editor path={`${name}/${activeTab.path}`} value={activeTab.content} language={activeTab.language} theme={monacoTheme}
                      onMount={editor => { editorLayoutRef.current = editor; }}
                      options={{
                        readOnly: activeTab.readOnly, minimap: { enabled: true }, automaticLayout: true,
                        fontFamily: 'var(--tf9-font-mono)', fontSize: 13, scrollBeyondLastLine: false,
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
                <div className="rw-resizer rw-resizer-vertical rw-diff-resizer" title="Drag to resize right panel"
                  onPointerDown={event => startHorizontalResize(event, diffWidth, updateDiffWidth, 1, 220, 900)}
                  onDoubleClick={() => updateDiffWidth(380)} />
                <aside className="rw-right-dock">
                  <div className="rw-dock-tabs">
                    <button
                      className={rightPanelTab === 'chat' ? 'active' : ''}
                      onClick={() => setRightPanelTab('chat')}
                    ><WorkbenchIcon name="ai" /> AI CHAT</button>
                    <button
                      className={rightPanelTab === 'diff' ? 'active' : ''}
                      onClick={() => setRightPanelTab('diff')}
                    ><WorkbenchIcon name="split" /> GIT DIFF</button>
                    <span className="rw-diff-size">{diffWidth}px</span>
                    <span className="rw-spacer" />
                    <button aria-label="Narrower" title="Narrower" onClick={() => updateDiffWidth(diffWidth - 80)}>−</button>
                    <button aria-label="Wider" title="Wider" onClick={() => updateDiffWidth(diffWidth + 80)}>＋</button>
                    <button title="Close right panel" onClick={() => setDiffVisible(false)}><WorkbenchIcon name="close" /></button>
                  </div>
                  <div className="rw-dock-content" hidden={rightPanelTab !== 'chat'}>
                    <WorkspaceChat repo={name} active={active && rightPanelTab === 'chat'} seed={chatSeed} onSeedConsumed={() => setChatSeed('')} />
                  </div>
                  <div className="rw-dock-content rw-diff" hidden={rightPanelTab !== 'diff'}>
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
                  </div>
                </aside>
              </>
            )}
          </div>

          {terminalOpen ? (
            <div className="rw-terminal-wrap" style={{ height: terminalMaximized ? '100%' : terminalHeight, flexBasis: terminalMaximized ? '100%' : terminalHeight }}>
              {!terminalMaximized && <div className="rw-resizer rw-resizer-horizontal" onPointerDown={startTerminalResize} />}
              <LiveTerminal
                repo={name}
                sessions={terminalSessions}
                activeSessionId={activeTerminalId}
                mode={mode}
                active={active}
                maximized={terminalMaximized}
                onSelectSession={setActiveTerminalId}
                onNewSession={() => openTerminal()}
                onTerminateSession={terminateTerminal}
                onToggleMaximize={() => setTerminalMaximized(value => !value)}
                onCollapse={() => {
                  setTerminalOpen(false);
                  setTerminalMaximized(false);
                }}
              />
            </div>
          ) : (
            <button className="rw-open-terminal" onClick={() => {
              if (terminalSessions.length === 0) openTerminal();
              else setTerminalOpen(true);
            }}><WorkbenchIcon name="terminal" /> Terminal</button>
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
      {gitOperationsOpen && (
        <GitOperationsModal
          repo={name}
          currentBranch={branch}
          branches={branches}
          blocked={gitOperationBlocked}
          onClose={() => setGitOperationsOpen(false)}
          onComplete={refreshAfterGitOperation}
        />
      )}
      {reconcileOpen && (
        <ReconcileModal
          repo={name}
          blocked={gitOperationBlocked}
          onClose={() => setReconcileOpen(false)}
          onComplete={refreshAfterGitOperation}
          onAskAI={status => void askAIReconcile(status)}
        />
      )}
      {entryModal && (
        <WorkspaceEntryModal
          key={`${entryModal.path}:${entryModal.isDir}`}
          entry={entryModal}
          onClose={() => setEntryModal(null)}
          onTerminal={() => {
            openTerminal(entryModal.path);
            setEntryModal(null);
          }}
          onRename={destination => renameEntry(entryModal, destination)}
          onDelete={() => deleteEntry(entryModal)}
        />
      )}
    </div>
  );

  return workbench;
}

function initialTabsState(): WorkspaceTabsState {
  return { version: 1, openRepositories: [], activeRepository: '' };
}

async function loadRepositories(): Promise<Repo[]> {
  const repositories: Repo[] = [];
  const limit = 500;
  for (let page = 1; ; page += 1) {
    const result = await api.get<Paginated<Repo>>(`/api/repos?page=${page}&limit=${limit}`);
    repositories.push(...result.items);
    if (repositories.length >= result.total || result.items.length === 0) return repositories;
  }
}

export default function RepositoryWorkspace({ name }: { name?: string }) {
  const { mode, navigate } = useNav();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [tabsState, setTabsState] = useState<WorkspaceTabsState>(initialTabsState);
  const [dirtyByRepo, setDirtyByRepo] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fullScreen, setFullScreen] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    loadRepositories()
      .then(result => {
        setRepos(result.filter(repo => !repo.disabled));
        setError('');
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load repositories.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const enabled = repos.map(repo => repo.name);
    setTabsState(current => {
      const saved = initialized.current ? current : readWorkspaceTabs(localStorage.getItem(WORKSPACE_TABS_KEY));
      initialized.current = true;
      return normalizeWorkspaceTabs(saved, enabled, name);
    });
  }, [loading, name, repos]);

  useEffect(() => {
    if (!initialized.current) return;
    try {
      localStorage.setItem(WORKSPACE_TABS_KEY, JSON.stringify(tabsState));
    } catch {
      /* ignore */
    }
  }, [tabsState]);

  useEffect(() => {
    if (!initialized.current || loading) return;
    if (tabsState.activeRepository !== (name ?? '')) {
      navigate(tabsState.activeRepository
        ? { id: 'workspace', name: tabsState.activeRepository }
        : { id: 'workspace' });
    }
  }, [loading, name, navigate, tabsState.activeRepository]);

  const reportDirty = useCallback((repo: string, dirty: boolean) => {
    setDirtyByRepo(current => current[repo] === dirty ? current : { ...current, [repo]: dirty });
  }, []);

  function openRepository(repository: string) {
    setTabsState(current => addWorkspaceRepository(current, repository));
    setError('');
    setPickerOpen(false);
    setQuery('');
  }

  function activateRepository(repository: string) {
    setTabsState(current => ({ ...current, activeRepository: repository }));
  }

  function closeRepository(repository: string) {
    if (dirtyByRepo[repository] && !window.confirm(`Discard unsaved changes in ${repository}?`)) return;
    try {
      localStorage.removeItem(workspaceSessionKey(repository));
    } catch {
      /* ignore */
    }
    setTabsState(current => closeWorkspaceRepository(current, repository));
    setDirtyByRepo(current => {
      const next = { ...current };
      delete next[repository];
      return next;
    });
  }

  if (loading) return <div className="workspace-loading">Loading workspace…</div>;

  const filteredRepos = repos.filter(repo => repo.name.toLowerCase().includes(query.toLowerCase()));
  if (tabsState.openRepositories.length === 0) {
    return (
      <Shell>
        <WorkspacePicker repos={repos} error={error} onOpen={openRepository} />
      </Shell>
    );
  }

  return (
    <Shell fullWidth>
      <div className={`workspace-host rw-theme-${mode}${fullScreen ? ' is-fullscreen' : ''}`}>
        <div className="workspace-repo-tabs" role="tablist" aria-label="Open repositories">
          <div className="workspace-repo-tabs-scroll">
            {tabsState.openRepositories.map(repository => (
              <div
                key={repository}
                role="tab"
                aria-selected={tabsState.activeRepository === repository}
                className={tabsState.activeRepository === repository ? 'active' : ''}
                title={repository}
              >
                <button className="workspace-repo-tab-main" onClick={() => activateRepository(repository)}>
                  <WorkbenchIcon name="repo" />
                  <span>{repository}</span>
                  {dirtyByRepo[repository] && <i className="workspace-repo-dirty" title="Unsaved changes" />}
                </button>
                <button
                  className="workspace-repo-tab-close"
                  aria-label={`Close ${repository}`}
                  onClick={() => closeRepository(repository)}
                >
                  <WorkbenchIcon name="close" />
                </button>
              </div>
            ))}
          </div>
          <div className="workspace-repo-add">
            <button
              className="workspace-repo-add-button"
              title="Open repository"
              aria-label="Open repository"
              onClick={() => setPickerOpen(value => !value)}
            >＋</button>
            {pickerOpen && (
              <div className="workspace-repo-picker">
                <input
                  autoFocus
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search repositories"
                  aria-label="Search repositories"
                />
                <div>
                  {filteredRepos.map(repo => (
                    <button key={repo.name} onClick={() => openRepository(repo.name)}>
                      <WorkbenchIcon name="repo" />
                      <span><strong>{repo.name}</strong><small>{repo.path}</small></span>
                      {tabsState.openRepositories.includes(repo.name) && <b>Open</b>}
                    </button>
                  ))}
                  {filteredRepos.length === 0 && <p>No matching repositories.</p>}
                </div>
              </div>
            )}
          </div>
          <span className="workspace-repo-count">{tabsState.openRepositories.length} open</span>
        </div>
        {error && <div className="workspace-host-error">{error}<button onClick={() => setError('')}><WorkbenchIcon name="close" /></button></div>}
        <div className="workspace-panes">
          {tabsState.openRepositories.map(repository => (
            <div key={repository} className="workspace-pane" hidden={tabsState.activeRepository !== repository}>
              <Workbench
                name={repository}
                active={tabsState.activeRepository === repository}
                fullScreen={fullScreen && tabsState.activeRepository === repository}
                onToggleFullScreen={() => setFullScreen(value => !value)}
                onDirtyChange={reportDirty}
              />
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
