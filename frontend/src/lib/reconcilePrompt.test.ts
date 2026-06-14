import { describe, expect, it } from 'vitest';
import type { ReconcileStatus } from '../types';
import { buildReconcilePrompt, DEFAULT_RECONCILE_PROMPT } from './reconcilePrompt';

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
    const prompt = buildReconcilePrompt('infra', {
      ...status,
      behind: 1,
      ahead: 2,
      diverged: true,
      behindCommits: [{
        Hash: 'aaaaaaaaaaaa1111',
        Subject: 'Add deployed network route',
        Author: 'Sam',
        Date: '2026-06-13',
      }],
      aheadCommits: [{
        Hash: 'bbbbbbbbbbbb2222',
        Subject: 'Update application role',
        Author: 'Me',
        Date: '2026-06-14',
      }],
    }, {
      windowDays: 30,
      limit: 20,
      branches: [
        { name: 'feature', hash: '1111111', author: 'Me', date: '2026-06-14', subject: 'Current', local: true, remote: true },
        { name: 'team/network', hash: '2222222', author: 'Sam', date: '2026-06-13', subject: 'Update network', local: true, remote: false },
        { name: 'team/data', hash: '3333333', author: 'Lee', date: '2026-06-12', subject: 'Update data', local: false, remote: true },
      ],
    });

    expect(prompt).toContain('Integration branch: origin/main');
    expect(prompt).toContain('Branch relationship: 1 behind, 2 ahead (diverged)');
    expect(prompt).toContain('aaaaaaaaaaaa Add deployed network route');
    expect(prompt).toContain('bbbbbbbbbbbb Update application role');
    expect(prompt).not.toContain('feature [');
    expect(prompt).toContain('team/network [local]');
    expect(prompt).toContain('team/data [origin]');
    expect(prompt).toContain('Inspect local branch refs first');
    expect(prompt).toContain('origin/<branch>');
  });

  it('requires diagnosis plus manual and AI-assisted resolution paths', () => {
    const prompt = buildReconcilePrompt('infra', status, null);

    expect(prompt).toContain('## Drift diagnosis');
    expect(prompt).toContain('## Option A: Fix manually');
    expect(prompt).toContain('numbered commands');
    expect(prompt).toContain('abort/rollback steps');
    expect(prompt).toContain('verification with terraform plan');
    expect(prompt).toContain('## Option B: Fix with AI');
    expect(prompt).toContain('wait for autoApply approval');
    expect(prompt).toContain('## Summary');
    expect(prompt).toContain('No changes were made.');
    expect(prompt).toContain('commands, changes, verification');
    expect(prompt).toContain('`tf9 init`');
    expect(prompt).toContain('`tf9 plan`');
    expect(prompt).toContain('run ID');
    expect(prompt).toContain('[Run History](#runs)');
    expect(prompt).toContain('concise result summary');
    expect(prompt).toContain('Do not run terraform apply/destroy');
  });

  it('keeps the required branch investigation instructions in the concise default', () => {
    expect(DEFAULT_RECONCILE_PROMPT).toContain(
      'For each drifted or missing resource, search the recent branches for the matching Terraform change.',
    );
    expect(DEFAULT_RECONCILE_PROMPT).toContain(
      'Inspect local branch refs first with read-only git commands (git log, git diff, git show <branch>:<file>).',
    );
    expect(DEFAULT_RECONCILE_PROMPT).toContain('origin/<branch> without checking it out.');
    expect(DEFAULT_RECONCILE_PROMPT).toContain('propose the minimal cherry-pick or rebase');
    expect(DEFAULT_RECONCILE_PROMPT).toContain('Do not push or run terraform apply.');
  });

  it('uses global custom instructions while preserving repository context', () => {
    const prompt = buildReconcilePrompt('infra', status, null, '', 'Follow the company runbook and request peer review.');

    expect(prompt).toContain('Current working branch: feature.');
    expect(prompt).toContain('Integration branch: origin/main.');
    expect(prompt).toContain('Follow the company runbook and request peer review.');
    expect(prompt).not.toContain('## Option A: Fix manually');
  });
});
