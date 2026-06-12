import type { WorkspaceFile } from '../types';

export const WORKSPACE_SESSION_PREFIX = 'tf9-workspace-session:';

export type StoredEditorTab = WorkspaceFile & {
  savedContent: string;
  dirty: boolean;
};

export type StoredTerminalSession = {
  id: number;
  directory: string;
};

export interface WorkspaceSessionState {
  version: 1;
  tabs: StoredEditorTab[];
  activePath: string;
  terminalSessions: StoredTerminalSession[];
  activeTerminalId: number;
  terminalOpen: boolean;
  terminalMaximized: boolean;
}

export function workspaceSessionKey(repository: string) {
  return `${WORKSPACE_SESSION_PREFIX}${encodeURIComponent(repository)}`;
}

export function defaultWorkspaceSession(): WorkspaceSessionState {
  return {
    version: 1,
    tabs: [],
    activePath: '',
    terminalSessions: [{ id: 0, directory: '' }],
    activeTerminalId: 0,
    terminalOpen: true,
    terminalMaximized: false,
  };
}

export function readWorkspaceSession(value: string | null): WorkspaceSessionState {
  const fallback = defaultWorkspaceSession();
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<WorkspaceSessionState>;
    if (parsed.version !== 1) return fallback;

    const seenPaths = new Set<string>();
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter((tab): tab is StoredEditorTab => {
          if (!tab || typeof tab !== 'object') return false;
          const candidate = tab as Partial<StoredEditorTab>;
          if (typeof candidate.path !== 'string' || !candidate.path || seenPaths.has(candidate.path)) return false;
          if (typeof candidate.content !== 'string' || typeof candidate.savedContent !== 'string') return false;
          if (typeof candidate.revision !== 'string' || typeof candidate.language !== 'string') return false;
          if (typeof candidate.size !== 'number' || typeof candidate.readOnly !== 'boolean' ||
              typeof candidate.binary !== 'boolean' || typeof candidate.dirty !== 'boolean') return false;
          seenPaths.add(candidate.path);
          return true;
        })
      : [];

    const seenTerminals = new Set<number>();
    const terminalSessions = Array.isArray(parsed.terminalSessions)
      ? parsed.terminalSessions.filter((session): session is StoredTerminalSession => {
          if (!session || typeof session !== 'object') return false;
          const candidate = session as Partial<StoredTerminalSession>;
          if (!Number.isInteger(candidate.id) || (candidate.id ?? -1) < 0 || seenTerminals.has(candidate.id!)) return false;
          if (typeof candidate.directory !== 'string') return false;
          seenTerminals.add(candidate.id!);
          return true;
        })
      : [];
    if (terminalSessions.length === 0) terminalSessions.push({ id: 0, directory: '' });

    const activePath = typeof parsed.activePath === 'string' && tabs.some(tab => tab.path === parsed.activePath)
      ? parsed.activePath
      : tabs[0]?.path ?? '';
    const activeTerminalId = Number.isInteger(parsed.activeTerminalId) &&
      terminalSessions.some(session => session.id === parsed.activeTerminalId)
      ? parsed.activeTerminalId!
      : terminalSessions[0].id;

    return {
      version: 1,
      tabs,
      activePath,
      terminalSessions,
      activeTerminalId,
      terminalOpen: typeof parsed.terminalOpen === 'boolean' ? parsed.terminalOpen : true,
      terminalMaximized: parsed.terminalOpen === false
        ? false
        : typeof parsed.terminalMaximized === 'boolean' && parsed.terminalMaximized,
    };
  } catch {
    return fallback;
  }
}
