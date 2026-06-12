import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('config editor loads the YAML and saves an edit', async ({ page }) => {
  await page.goto('/#config');
  await expect(page.locator('.page-title', { hasText: 'Config YAML' })).toBeVisible();

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

test('format document tidies trailing whitespace', async ({ page }) => {
  await page.goto('/#config');
  const editor = page.locator('.ed-input');
  await expect(editor).toContainText('version: 1');

  const current = await editor.inputValue();
  await editor.fill(current.replace(/\n*$/, '') + '   \n\n\n');
  await page.getByRole('button', { name: 'Format document' }).click();
  await expect(page.locator('.toast.show')).toContainText('Formatted');
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
