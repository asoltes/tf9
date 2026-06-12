import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('dashboard renders heading, actions, and status tiles', async ({ page }) => {
  await page.goto('/#overview');
  await expect(page.locator('.overview-page .page-title')).toHaveText('Dashboard');
  await expect(page.getByRole('button', { name: 'Start Terraform Run' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Repository Workspace' })).toBeVisible();
  // One tile per run status, with an honest scope note.
  await expect(page.locator('.dash-tile')).toHaveCount(5);
  await expect(page.locator('.dash-tiles-note')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Execution mode analysis' })).toBeVisible();
  await shot(page, 'overview-dashboard');
});

test('dashboard resources link to repositories and reports', async ({ page }) => {
  await page.goto('/#overview');
  const resources = page.locator('section[aria-label="Resources"]');
  await expect(resources).toBeVisible();
  // The e2e fixture configures two repositories.
  await resources.locator('a[href="#repos"]').click();
  await expect(page.locator('.page-title', { hasText: 'Repositories' })).toBeVisible();
});

test('"Start Terraform Run" opens the new run modal', async ({ page }) => {
  await page.goto('/#overview');
  await page.getByRole('button', { name: 'Start Terraform Run' }).click();
  await expect(page.locator('.run-modal[role="dialog"]')).toBeVisible();
});

test('status tiles navigate to run history', async ({ page }) => {
  await page.goto('/#overview');
  await page.locator('.dash-tile.st-running').click();
  await expect(page.locator('.runs-page')).toBeVisible();
  await expect(page).toHaveURL(/#runs\?status=running$/);
  const statusFilter = page.getByRole('button', { name: 'Status: running' });
  await expect(statusFilter).toBeVisible();
  await statusFilter.click();
  const statusOptions = page.getByRole('group', { name: 'Filter by status' });
  await expect(statusOptions.getByText('All statuses')).toBeVisible();
  await statusOptions.getByText('failed', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Statuses: 2' })).toBeVisible();
  await expect(page).toHaveURL(/status=running.*status=failed/);
});

test('dashboard shows real mode analysis and timestamps', async ({ page }) => {
  const response = await page.request.post('/api/runs', {
    data: { command: 'init', repo: 'e2e-repo', envFilter: 'staging' },
  });
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  await expect.poll(async () => {
    const runResponse = await page.request.get(`/api/runs/${id}`);
    return (await runResponse.json()).status;
  }, { timeout: 45_000 }).toBe('success');

  await page.goto('/#overview');
  const recent = page.getByRole('region', { name: 'Recent runs' });
  await expect(recent.locator('.dash-run-date small').first()).not.toHaveText('');

  const analysis = page.getByRole('region', { name: 'Execution mode analysis' });
  await expect(analysis).toContainText('Promotion 1');
});
