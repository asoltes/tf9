import { describe, expect, it } from 'vitest';
import type { ReconcileStatus } from '../types';
import { buildReconcilePrompt } from './reconcilePrompt';

const status = {
  currentBranch: 'feature',
  integrationBranch: 'main',
  integrationRef: 'origin/main',
  behind: 0,
  ahead: 1,
  behindCommits: [],
} as ReconcileStatus;

describe('buildReconcilePrompt', () => {
  it('strips terminal ANSI sequences from embedded terraform output', () => {
    const prompt = buildReconcilePrompt(
      'infra',
      status,
      null,
      '[development] \x1b[1m  # terraform_data.target\x1b[0m will be updated\n'
        + '[development] \x1b[33m~\x1b[0m input = "development"',
    );

    expect(prompt).toContain('```terraform');
    expect(prompt).toContain('[development]   # terraform_data.target will be updated');
    expect(prompt).toContain('[development] ~ input = "development"');
    expect(prompt).not.toContain('\x1b[');
  });

  it('focuses reconciliation on active local and remote teammate branches', () => {
    const prompt = buildReconcilePrompt('infra', status, {
      windowDays: 30,
      limit: 20,
      branches: [
        { name: 'feature', hash: '1111111', author: 'Me', date: '2026-06-14', subject: 'Current', local: true, remote: true },
        { name: 'team/network', hash: '2222222', author: 'Sam', date: '2026-06-13', subject: 'Update network', local: true, remote: false },
        { name: 'team/data', hash: '3333333', author: 'Lee', date: '2026-06-12', subject: 'Update data', local: false, remote: true },
      ],
    });

    expect(prompt).not.toContain('Integration branch');
    expect(prompt).not.toContain('feature [');
    expect(prompt).toContain('team/network [local]');
    expect(prompt).toContain('team/data [origin]');
    expect(prompt).toContain('Inspect local branch refs first');
    expect(prompt).toContain('origin/<branch>');
  });
});
