import type { GitChangedFile } from '../types';

export type GitDecorationKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict';

export interface GitDecoration {
  kind: GitDecorationKind;
  label: string;
  title: string;
  xy: string;
}

export function changedFilePath(path: string): string {
  const arrow = path.lastIndexOf(' -> ');
  return arrow >= 0 ? path.slice(arrow + 4) : path;
}

export function gitDecoration(xy: string): GitDecoration {
  const code = xy.trim();
  if (xy === '??') return { kind: 'untracked', label: 'U', title: 'Untracked', xy };
  if (code.includes('U') || code === 'AA' || code === 'DD') {
    return { kind: 'conflict', label: '!', title: 'Merge conflict', xy };
  }
  if (code.includes('R')) return { kind: 'renamed', label: 'R', title: 'Renamed', xy };
  if (code.includes('D')) return { kind: 'deleted', label: 'D', title: 'Deleted', xy };
  if (code.includes('A')) return { kind: 'added', label: 'A', title: 'Added', xy };
  return { kind: 'modified', label: 'M', title: 'Modified', xy };
}

export function buildGitDecorationMaps(files: GitChangedFile[]) {
  const filesByPath = new Map<string, GitDecoration>();
  const directories = new Map<string, number>();

  for (const file of files) {
    const path = changedFilePath(file.path);
    filesByPath.set(path, gitDecoration(file.xy));
    const parts = path.split('/');
    parts.pop();
    let parent = '';
    for (const part of parts) {
      parent = parent ? `${parent}/${part}` : part;
      directories.set(parent, (directories.get(parent) ?? 0) + 1);
    }
  }
  return { filesByPath, directories };
}
