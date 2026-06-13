import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('config editor loads the YAML and saves an edit', async ({ page }) => {
  await page.goto('/#config');
  await expect(page.locator('.page-title', { hasText: 'Configuration' })).toBeVisible();

  const editor = page.locator('.ed-input');
  await expect(editor).toContainText('version: 1');
  await expect(editor).toContainText('e2e-repo');

  // Save is disabled until the document is dirty.
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  const current = await editor.inputValue();
  await editor.fill(current.replace(/\n*$/, '') + '\n# e2e marker\n');

  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('.toast.show')).toContainText('Config saved');
  await shot(page, 'config-saved');
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

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.toast.show')).toContainText('Fix errors before saving');
  await expect(page.locator('.ed-problems')).toContainText('aws_profile');
  await shot(page, 'config-problems');
});
