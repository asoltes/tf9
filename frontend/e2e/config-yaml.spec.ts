import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('config editor loads the YAML and saves an edit', async ({ page }) => {
  await page.goto('/#config');
  await expect(page.locator('.page-title', { hasText: 'Configuration' })).toBeVisible();

  const editor = page.locator('.ed-input');
  await expect(editor).toContainText('version: 1');
  await expect(editor).toContainText('e2e-repo');

  // Save is disabled until the document is dirty.
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

  const current = await editor.inputValue();
  await editor.fill(current.replace(/\n*$/, '') + '\n# e2e marker\n');

  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('.toast.show')).toContainText('Config saved');
  await shot(page, 'config-saved');
});

test('configuration manages repository defaults and the global reconcile prompt', async ({ page }) => {
  const configResponse = await page.request.get('/api/repos/e2e-repo/config');
  const originalConfig = await configResponse.json();
  const promptResponse = await page.request.get('/api/web/reconcile-prompt');
  const originalPrompt = await promptResponse.json();

  try {
    await page.route('**/api/aws/profile-details', route => route.fulfill({
      json: {
        'e2e-profile': {
          region: 'us-west-2',
          account_id: '123456789012',
        },
      },
    }));
    await page.route('**/api/aws/profiles', route => route.fulfill({ json: ['e2e-profile'] }));
    await page.goto('/#config');

    await expect(page.getByText('Global settings', { exact: true })).toBeVisible();
    await page.locator('.config-settings-repo select').selectOption('e2e-repo');
    await page.getByLabel('Default AWS profile').selectOption('e2e-profile');
    await expect(page.getByLabel('Default region')).toHaveValue('us-west-2');
    await expect(page.getByLabel('Default account ID')).toHaveValue('123456789012');
    await page.getByLabel('Deployment baseline').fill('trunk');
    await page.getByLabel('Recent branch window').fill('21');
    await page.getByLabel('Maximum AI branches').fill('12');
    await page.getByRole('button', { name: 'Save defaults' }).click();
    await expect(page.locator('.toast.show')).toContainText('Repository defaults');

    const promptEditor = page.getByLabel('Global reconcile with AI prompt');
    await expect(promptEditor).toHaveValue(/For each drifted or missing resource/);
    await promptEditor.fill('Follow the Configuration page runbook.');
    await page.getByRole('button', { name: 'Save prompt' }).click();
    await expect(page.locator('.toast.show')).toContainText('prompt saved');

    const savedConfig = await (await page.request.get('/api/repos/e2e-repo/config')).json();
    expect(savedConfig.default_aws_profile).toBe('e2e-profile');
    expect(savedConfig.default_region).toBe('us-west-2');
    expect(savedConfig.default_account_id).toBe('123456789012');
    expect(savedConfig.integration_branch).toBe('trunk');
    expect(savedConfig.active_branch_window_days).toBe(21);
    expect(savedConfig.active_branch_limit).toBe(12);
    const savedPrompt = await (await page.request.get('/api/web/reconcile-prompt')).json();
    expect(savedPrompt.prompt).toBe('Follow the Configuration page runbook.');
    await shot(page, 'config-global-settings');
  } finally {
    await page.request.put('/api/repos/e2e-repo/config', { data: originalConfig });
    await page.request.put('/api/web/reconcile-prompt', { data: originalPrompt });
  }
});

test('format document normalizes YAML indentation and preserves comments', async ({ page }) => {
  await page.goto('/#config');
  const editor = page.locator('.ed-input');
  await expect(editor).toContainText('version: 1');

  await editor.fill([
    '# keep this comment',
    'version: 1',
    'repositories:',
    '    - name: infra',
    '      path: /tmp/infra',
    '',
  ].join('\n'));
  await page.getByRole('button', { name: 'Format document' }).click();
  await expect(page.locator('.toast.show')).toContainText('Document formatted');
  await expect(editor).toHaveValue([
    '# keep this comment',
    'version: 1',
    'repositories:',
    '  - name: infra',
    '    path: /tmp/infra',
    '',
  ].join('\n'));
});

test('config editor follows the application theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tf9-color-mode', 'light'));
  await page.goto('/#config');
  const editor = page.locator('.editor');
  await expect(editor).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Cycle theme' }).click();
  await expect(editor).toHaveAttribute('data-theme', 'dark');
  await expect(editor).toHaveAttribute('data-variant', 'dark');

  await page.getByRole('button', { name: 'Cycle theme' }).click();
  await expect(editor).toHaveAttribute('data-theme', 'dark');
  await expect(editor).toHaveAttribute('data-variant', 'dim');
});

test('invalid schema surfaces problems and blocks save', async ({ page }) => {
  await page.goto('/#config');
  const editor = page.locator('.ed-input');
  await expect(editor).toContainText('version: 1');

  // A target missing its required aws_profile is a schema error.
  await editor.fill([
    'version: 1',
    'repositories:',
    '  - name: broken',
    '    path: /tmp/tf9-playwright/repo',
    '    targets:',
    '      - name: t1',
    '        directory: environments/dev',
    '',
  ].join('\n'));

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast.show')).toContainText('Fix errors before saving');
  await expect(page.locator('.ed-problems')).toContainText('aws_profile');
  await shot(page, 'config-problems');
});
