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
});
