import { describe, expect, it } from 'vitest';
import {
  addWorkspaceRepository,
  closeWorkspaceRepository,
  normalizeWorkspaceTabs,
  readWorkspaceTabs,
} from './workspaceTabs';

describe('workspace repository tabs', () => {
  it('restores enabled repositories and lets the URL take precedence', () => {
    const state = normalizeWorkspaceTabs({
      version: 1,
      openRepositories: ['one', 'removed', 'two'],
      activeRepository: 'one',
    }, ['one', 'two', 'three'], 'three');
    expect(state).toEqual({
      version: 1,
      openRepositories: ['one', 'two', 'three'],
      activeRepository: 'three',
    });
  });

  it('does not duplicate an already open repository', () => {
    const state = addWorkspaceRepository({
      version: 1,
      openRepositories: ['one', 'two'],
      activeRepository: 'one',
    }, 'two');
    expect(state.openRepositories).toEqual(['one', 'two']);
    expect(state.activeRepository).toBe('two');
  });

  it('allows any number of live repositories', () => {
    const repositories = Array.from({ length: 500 }, (_, index) => `repo-${index}`);
    const state = addWorkspaceRepository({
      version: 1,
      openRepositories: repositories,
      activeRepository: repositories[0],
    }, 'extra');
    expect(state.openRepositories).toHaveLength(501);
    expect(state.openRepositories.at(-1)).toBe('extra');
    expect(state.activeRepository).toBe('extra');
  });

  it('selects the next tab, then the previous tab, when closing', () => {
    const state = { version: 1 as const, openRepositories: ['one', 'two', 'three'], activeRepository: 'two' };
    expect(closeWorkspaceRepository(state, 'two').activeRepository).toBe('three');
    expect(closeWorkspaceRepository({ ...state, activeRepository: 'three' }, 'three').activeRepository).toBe('two');
  });

  it('rejects invalid persisted data', () => {
    expect(readWorkspaceTabs('{')).toBeNull();
    expect(readWorkspaceTabs('{"version":2,"openRepositories":[]}')).toBeNull();
  });
});
