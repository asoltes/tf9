import { describe, expect, it } from 'vitest';
import { classifyGitDiffLine, parseGitDiff } from './gitDiff';

describe('Git diff line classification', () => {
  it('distinguishes headers, hunks, additions, deletions, and metadata', () => {
    expect(classifyGitDiffLine('diff --git a/main.tf b/main.tf')).toBe('file');
    expect(classifyGitDiffLine('--- a/main.tf')).toBe('header');
    expect(classifyGitDiffLine('+++ b/main.tf')).toBe('header');
    expect(classifyGitDiffLine('@@ -1,2 +1,3 @@')).toBe('hunk');
    expect(classifyGitDiffLine('+resource "x" "y" {}')).toBe('addition');
    expect(classifyGitDiffLine('-resource "x" "old" {}')).toBe('deletion');
    expect(classifyGitDiffLine('index 123..456 100644')).toBe('metadata');
    expect(classifyGitDiffLine(' unchanged')).toBe('context');
  });

  it('preserves diff text and blank lines', () => {
    expect(parseGitDiff('+one\n\n-two')).toEqual([
      { text: '+one', kind: 'addition' },
      { text: '', kind: 'context' },
      { text: '-two', kind: 'deletion' },
    ]);
  });
});
