export const WORKSPACE_TABS_KEY = 'tf9-workspace-tabs';

export interface WorkspaceTabsState {
  version: 1;
  openRepositories: string[];
  activeRepository: string;
}

export function readWorkspaceTabs(value: string | null): WorkspaceTabsState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<WorkspaceTabsState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.openRepositories)) return null;
    const openRepositories = parsed.openRepositories.filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    );
    return {
      version: 1,
      openRepositories,
      activeRepository: typeof parsed.activeRepository === 'string' ? parsed.activeRepository : '',
    };
  } catch {
    return null;
  }
}

export function normalizeWorkspaceTabs(
  saved: WorkspaceTabsState | null,
  enabledRepositories: string[],
  requestedRepository = '',
): WorkspaceTabsState {
  const enabled = new Set(enabledRepositories);
  const openRepositories = Array.from(new Set(saved?.openRepositories ?? []))
    .filter(name => enabled.has(name));

  if (requestedRepository && enabled.has(requestedRepository)) {
    const existing = openRepositories.indexOf(requestedRepository);
    if (existing === -1) openRepositories.push(requestedRepository);
  }

  const preferred = requestedRepository && openRepositories.includes(requestedRepository)
    ? requestedRepository
    : saved?.activeRepository;
  return {
    version: 1,
    openRepositories,
    activeRepository: preferred && openRepositories.includes(preferred)
      ? preferred
      : openRepositories[0] ?? '',
  };
}

export function addWorkspaceRepository(
  state: WorkspaceTabsState,
  repository: string,
): WorkspaceTabsState {
  if (state.openRepositories.includes(repository)) {
    return { ...state, activeRepository: repository };
  }
  return {
    version: 1,
    openRepositories: [...state.openRepositories, repository],
    activeRepository: repository,
  };
}

export function closeWorkspaceRepository(
  state: WorkspaceTabsState,
  repository: string,
): WorkspaceTabsState {
  const index = state.openRepositories.indexOf(repository);
  if (index === -1) return state;
  const openRepositories = state.openRepositories.filter(name => name !== repository);
  const activeRepository = state.activeRepository === repository
    ? openRepositories[index] ?? openRepositories[index - 1] ?? ''
    : state.activeRepository;
  return { version: 1, openRepositories, activeRepository };
}
