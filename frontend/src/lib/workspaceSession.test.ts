import { describe, expect, it } from 'vitest';
import { defaultWorkspaceSession, readWorkspaceSession, workspaceSessionKey } from './workspaceSession';

const file = {
  path: 'main.tf',
  content: 'draft',
  savedContent: 'saved',
  revision: 'rev',
  size: 5,
  language: 'hcl',
  readOnly: false,
  binary: false,
  dirty: true,
};

describe('workspace session persistence', () => {
  it('restores editor drafts and terminal tabs', () => {
    expect(readWorkspaceSession(JSON.stringify({
      version: 1,
      tabs: [file],
      activePath: 'main.tf',
      terminalSessions: [{ id: 2, directory: 'modules' }],
      activeTerminalId: 2,
      terminalOpen: true,
      terminalMaximized: true,
    }))).toEqual({
      version: 1,
      tabs: [file],
      activePath: 'main.tf',
      terminalSessions: [{ id: 2, directory: 'modules' }],
      activeTerminalId: 2,
      terminalOpen: true,
      terminalMaximized: true,
    });
  });

  it('normalizes invalid active values and duplicate entries', () => {
    const state = readWorkspaceSession(JSON.stringify({
      version: 1,
      tabs: [file, file],
      activePath: 'missing.tf',
      terminalSessions: [{ id: 4, directory: '' }, { id: 4, directory: 'modules' }],
      activeTerminalId: 99,
      terminalOpen: false,
      terminalMaximized: true,
    }));
    expect(state.tabs).toHaveLength(1);
    expect(state.activePath).toBe('main.tf');
    expect(state.terminalSessions).toEqual([{ id: 4, directory: '' }]);
    expect(state.activeTerminalId).toBe(4);
    expect(state.terminalMaximized).toBe(false);
  });

  it('falls back for malformed data and scopes keys by repository', () => {
    expect(readWorkspaceSession('{')).toEqual(defaultWorkspaceSession());
    expect(workspaceSessionKey('team/repo')).toBe('tf9-workspace-session:team%2Frepo');
  });
});
