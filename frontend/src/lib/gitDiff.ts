export type GitDiffLineKind =
  | 'file'
  | 'header'
  | 'hunk'
  | 'addition'
  | 'deletion'
  | 'metadata'
  | 'context';

export interface GitDiffLine {
  text: string;
  kind: GitDiffLineKind;
}

export function classifyGitDiffLine(line: string): GitDiffLineKind {
  if (line.startsWith('diff --git ')) return 'file';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+++ ') || line.startsWith('--- ')) return 'header';
  if (line.startsWith('+')) return 'addition';
  if (line.startsWith('-')) return 'deletion';
  if (
    line.startsWith('index ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('similarity index ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ') ||
    line.startsWith('\\ No newline')
  ) {
    return 'metadata';
  }
  return 'context';
}

export function parseGitDiff(diff: string): GitDiffLine[] {
  return diff.split('\n').map(text => ({ text, kind: classifyGitDiffLine(text) }));
}
