import { describe, expect, it } from 'vitest';
import { buildGitDecorationMaps, changedFilePath, gitDecoration } from './gitStatusDecorations';

describe('Git status decorations', () => {
  it('maps porcelain codes to visible decorations', () => {
    expect(gitDecoration(' M').label).toBe('M');
    expect(gitDecoration('A ').kind).toBe('added');
    expect(gitDecoration('??').kind).toBe('untracked');
    expect(gitDecoration('R ').label).toBe('R');
    expect(gitDecoration('UU').kind).toBe('conflict');
  });

  it('uses the destination path for renamed files', () => {
    expect(changedFilePath('old.tf -> modules/new.tf')).toBe('modules/new.tf');
  });

  it('aggregates changed files into every parent folder', () => {
    const maps = buildGitDecorationMaps([
      { xy: ' M', path: 'modules/network/main.tf' },
      { xy: '??', path: 'modules/network/outputs.tf' },
      { xy: 'A ', path: 'environments/dev/main.tf' },
    ]);
    expect(maps.filesByPath.get('modules/network/main.tf')?.label).toBe('M');
    expect(maps.directories.get('modules')).toBe(2);
    expect(maps.directories.get('modules/network')).toBe(2);
    expect(maps.directories.get('environments/dev')).toBe(1);
  });
});
