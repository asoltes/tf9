import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Records a video demonstration of the branch-reconciliation flow:
// a feature branch that is behind the integration branch (origin/main) is
// detected as drifted, rebased to reconcile, then promoted back to main.
//
// Run with:
//   npx playwright test e2e/reconcile-demo.spec.ts
// The video lands under frontend/test-results/.../video.webm

const fixture = '/tmp/tf9-reconcile-demo';
const origin = join(fixture, 'origin.git');
const work = join(fixture, 'work');

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Dev', GIT_AUTHOR_EMAIL: 'dev@example.invalid',
      GIT_COMMITTER_NAME: 'Dev', GIT_COMMITTER_EMAIL: 'dev@example.invalid',
    },
    stdio: 'ignore',
  });
}

function commit(file: string, body: string, message: string) {
  mkdirSync(join(work, 'dev'), { recursive: true });
  writeFileSync(join(work, 'dev', file), body);
  git(work, 'add', '.');
  git(work, 'commit', '-m', message);
}

test.beforeAll(async ({ request }) => {
  // ── Build the drift scenario ───────────────────────────────────────────────
  rmSync(fixture, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  git(fixture, 'init', '--bare', 'origin.git');
  git(work, 'init', '--initial-branch=main');
  git(work, 'remote', 'add', 'origin', origin);

  commit('main.tf', 'resource "terraform_data" "base" {}\n', 'base infra');
  git(work, 'push', '-u', 'origin', 'main');
  // A teammate's change is applied and lands on main — feature will be missing it.
  commit('vpc.tf', 'resource "terraform_data" "vpc" {}\n', 'add vpc (deployed by teammate)');
  git(work, 'push', 'origin', 'main');
  // My feature branch was cut BEFORE the vpc commit → it is 1 behind main.
  git(work, 'checkout', '-b', 'feature', 'HEAD~1');
  commit('app.tf', 'resource "terraform_data" "app" {}\n', 'add app on feature');
  // A teammate's separate open branch holding code AI auto-mode could search.
  git(work, 'checkout', '-b', 'teammate/cache', 'main');
  commit('cache.tf', 'resource "terraform_data" "cache" {}\n', 'add redis cache (open branch)');
  git(work, 'push', 'origin', 'teammate/cache');
  git(work, 'checkout', 'feature');
  git(work, 'fetch', 'origin');

  // ── Register the repo with the running tf9 server ──────────────────────────
  const add = await request.post('/api/repos', { data: { name: 'drift-demo', path: work } });
  expect(add.ok()).toBeTruthy();
  const cfg = await request.put('/api/repos/drift-demo/config', {
    data: {
      integration_branch: 'main',
      active_branch_window_days: 30,
      active_branch_limit: 10,
      targets: [{ name: 'dev', directory: 'dev', aws_profile: 'e2e-profile', region: 'us-east-1' }],
    },
  });
  expect(cfg.ok()).toBeTruthy();
});

test.afterAll(async ({ request }) => {
  // Keep the shared e2e config clean for the rest of the suite.
  await request.delete('/api/repos/drift-demo').catch(() => {});
});

test('detects drift, reconciles via rebase, and promotes back', async ({ page }) => {
  // Auto-accept the window.confirm() dialogs the reconcile actions raise.
  page.on('dialog', dialog => dialog.accept());

  await page.goto('/#workspace/drift-demo');
  // We start on the drifted feature branch.
  await expect(page.locator('header').getByLabel('Git branch')).toHaveValue('feature');

  // ── Open the Reconcile panel — drift is detected ───────────────────────────
  await page.getByRole('button', { name: 'Reconcile' }).click();
  const modal = page.getByRole('dialog', { name: 'Reconcile branch' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('1 behind');
  await expect(modal).toContainText('add vpc (deployed by teammate)');
  await expect(modal.getByRole('button', { name: 'Rebase onto main' })).toBeEnabled();
  await page.screenshot({ path: 'reconcile-1-drift-detected.png' });
  await page.waitForTimeout(1500); // let the recording linger on the detected drift

  // ── Reconcile: rebase feature onto origin/main ─────────────────────────────
  await modal.getByRole('button', { name: 'Rebase onto main' }).click();

  // After reconciling, the branch is no longer behind and promotion is offered.
  await expect(modal.getByRole('button', { name: 'Promote to main' })).toBeVisible({ timeout: 20_000 });
  await expect(modal).toContainText('0 behind');
  await page.screenshot({ path: 'reconcile-2-reconciled.png' });
  await page.waitForTimeout(1500);

  // ── Promote: merge feature back into main and push to origin ───────────────
  await modal.getByRole('button', { name: 'Promote to main' }).click();
  await expect(modal.getByRole('button', { name: /Promote to main/ })).toBeHidden({ timeout: 20_000 });
  await page.waitForTimeout(1000);
});
