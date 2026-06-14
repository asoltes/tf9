import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('repositories list shows the fixture repo and its pipeline', async ({ page }) => {
  await page.goto('/#repos');
  await expect(page.locator('.page-title', { hasText: 'Repositories' })).toBeVisible();

  const row = page.locator('table.tbl tbody tr', { hasText: 'e2e-repo' });
  await expect(row).toBeVisible();
  await expect(row.locator('.mini-pipe')).toBeVisible();
  await shot(page, 'repos-list');
});

// Full add → rename → remove lifecycle through the real /api/repos endpoints.
test('add, rename and remove a repository', async ({ page }) => {
  await page.goto('/#repos');

  // ── Add ──
  await page.getByRole('button', { name: 'Add repository' }).click();
  const modal = page.locator('.modal', { hasText: 'Add repository' });
  await expect(modal).toBeVisible();
  await modal.locator('input.inp').first().fill('e2e-extra');
  await modal.locator('input.inp.mono').fill('/tmp/tf9-playwright');
  await modal.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.toast.show')).toContainText('e2e-extra');
  await expect(page.locator('table.tbl tbody tr', { hasText: 'e2e-extra' })).toBeVisible();

  // ── Rename ──
  await page.getByRole('button', { name: 'Rename e2e-extra' }).click();
  const renameInput = page.getByRole('textbox', { name: 'New repository name' });
  await renameInput.fill('e2e-renamed');
  await renameInput.press('Enter');
  await expect(page.locator('.toast.show')).toContainText('Renamed');
  await expect(page.locator('table.tbl tbody tr', { hasText: 'e2e-renamed' })).toBeVisible();

  // ── Remove (via confirm modal) ──
  await page.getByRole('button', { name: 'Remove e2e-renamed' }).click();
  const confirm = page.locator('.modal', { hasText: 'Remove repository' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.toast.show')).toContainText('Removed e2e-renamed');
  await expect(page.locator('table.tbl tbody tr', { hasText: 'e2e-renamed' })).toHaveCount(0);

  // The original fixture repo is untouched.
  await expect(page.locator('table.tbl tbody tr', { hasText: 'e2e-repo' })).toBeVisible();
});

test('deletes a stage from the pipeline after confirmation', async ({ page }) => {
  const configResponse = await page.request.get('/api/repos/e2e-repo/config');
  const originalConfig = await configResponse.json();

  try {
    await page.goto('/#repos');
    const row = page.locator('table.tbl tbody tr', { hasText: 'e2e-repo' });
    await row.getByRole('button', { name: 'Configure' }).click();

    const deleteButton = page.getByRole('button', { name: 'Delete dev stage' });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    const confirm = page.locator('.modal', { hasText: 'Delete stage' });
    await expect(confirm).toContainText('dev');
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('.toast.show')).toContainText('Removed dev');
    await expect(page.getByRole('button', { name: 'Delete dev stage' })).toHaveCount(0);
  } finally {
    await page.request.put('/api/repos/e2e-repo/config', { data: originalConfig });
  }
});

test('repository defaults populate newly added targets', async ({ page }) => {
  const configResponse = await page.request.get('/api/repos/e2e-repo/config');
  const originalConfig = await configResponse.json();
  const promptResponse = await page.request.get('/api/web/reconcile-prompt');
  const originalPrompt = await promptResponse.json();

  try {
    await page.request.put('/api/repos/e2e-repo/config', {
      data: {
        default_aws_profile: '',
        default_account_id: '',
        default_region: '',
        targets: [],
      },
    });
    await page.route('**/api/aws/profile-details', route => route.fulfill({
      json: {
        'e2e-profile': {
          region: 'us-west-2',
          account_id: '123456789012',
        },
      },
    }));
    await page.route('**/api/aws/profiles', route => route.fulfill({
      json: ['e2e-profile'],
    }));

    await page.goto('/#repos');
    const row = page.locator('table.tbl tbody tr', { hasText: 'e2e-repo' });
    await row.getByRole('button', { name: 'Configure' }).click();

    await expect(page.getByRole('heading', { name: /Global settings/ })).toBeVisible();
    await expect(page.locator('.repos-settings-repo')).toHaveCount(0);
    await expect(page.getByText('AWS defaults', { exact: true })).toBeVisible();
    await expect(page.getByText('Branch discovery', { exact: true })).toBeVisible();
    const promptEditor = page.getByLabel('Global reconcile with AI prompt');
    await expect(promptEditor).toBeVisible();
    await expect(promptEditor).toHaveValue(/For each drifted or missing resource/);
    await promptEditor.fill('Follow the E2E reconciliation runbook.');
    await page.getByRole('button', { name: 'Save prompt' }).click();
    await expect(page.locator('.toast.show')).toContainText('prompt saved');
    const promptOnlyResponse = await page.request.get('/api/web/reconcile-prompt');
    const promptOnly = await promptOnlyResponse.json();
    expect(promptOnly.prompt).toBe('Follow the E2E reconciliation runbook.');
    await page.getByLabel('Default AWS profile').selectOption('e2e-profile');
    await expect(page.getByLabel('Default region')).toHaveValue('us-west-2');
    await expect(page.getByLabel('Default account ID')).toHaveValue('123456789012');
    await page.getByLabel('Deployment baseline').fill('trunk');
    await page.getByLabel('Recent branch window').fill('21');
    await page.getByLabel('Maximum AI branches').fill('12');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.locator('.toast.show')).toContainText('saved');
    await expect(page.getByLabel('Deployment baseline')).toHaveValue('trunk');
    await expect(page.getByLabel('Recent branch window')).toHaveValue('21');
    await expect(page.getByLabel('Maximum AI branches')).toHaveValue('12');
    await shot(page, 'repos-global-settings');

    const environments = page.locator('.dir-row', { hasText: 'environments' });
    await environments.getByRole('button', { name: 'Open' }).click();
    const dev = page.locator('.dir-row', { hasText: 'dev' });
    await dev.getByRole('button', { name: 'Add to pipeline' }).click();
    await expect(page.locator('.toast.show')).toContainText('Added dev');

    const savedResponse = await page.request.get('/api/repos/e2e-repo/config');
    const saved = await savedResponse.json();
    expect(saved.default_aws_profile).toBe('e2e-profile');
    expect(saved.default_region).toBe('us-west-2');
    expect(saved.default_account_id).toBe('123456789012');
    expect(saved.integration_branch).toBe('trunk');
    expect(saved.active_branch_window_days).toBe(21);
    expect(saved.active_branch_limit).toBe(12);
    expect(saved.targets).toEqual([expect.objectContaining({
      name: 'dev',
      directory: 'environments/dev',
      aws_profile: 'e2e-profile',
      region: 'us-west-2',
      account_id: '123456789012',
    })]);
  } finally {
    await page.request.put('/api/repos/e2e-repo/config', { data: originalConfig });
    await page.request.put('/api/web/reconcile-prompt', { data: originalPrompt });
  }
});
