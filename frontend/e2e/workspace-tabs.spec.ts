import { expect, test } from '@playwright/test';

async function openRepository(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Open repository' }).click();
  await page.getByRole('textbox', { name: 'Search repositories' }).fill(name);
  await page.locator('.workspace-repo-picker').getByRole('button', { name: new RegExp(name) }).click();
}

test('opens, switches, and restores multiple repository tabs', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  const firstTerminal = page.locator('.workspace-pane:not([hidden]) .rw-terminal-host');
  const terminalInput = firstTerminal.getByRole('textbox', { name: 'Terminal input' });
  await terminalInput.fill('echo repo-one-marker');
  await terminalInput.press('Enter');
  await expect(firstTerminal).toContainText('repo-one-marker');

  await openRepository(page, 'e2e-service');
  await expect(page).toHaveURL(/#workspace\/e2e-service$/);
  await expect(page.locator('.workspace-repo-tabs [role="tab"]')).toHaveCount(2);
  await expect(page.locator('.workspace-pane:not([hidden]) .rw-workbench-name')).toContainText('e2e-service');

  await page.locator('.workspace-repo-tabs [role="tab"]', { hasText: 'e2e-repo' }).getByRole('button').first().click();
  await expect(page).toHaveURL(/#workspace\/e2e-repo$/);
  await expect(page.locator('.workspace-pane:not([hidden]) .rw-terminal-host')).toContainText('repo-one-marker');

  await openRepository(page, 'e2e-service');
  await expect(page.locator('.workspace-repo-tabs [role="tab"]')).toHaveCount(2);

  await page.reload();
  await expect(page.locator('.workspace-repo-tabs [role="tab"]')).toHaveCount(2);
  await expect(page.locator('.workspace-pane:not([hidden]) .rw-workbench-name')).toContainText('e2e-service');
});

test('preserves dirty editor state and confirms repository close', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  await page.locator('.rw-tree-row', { hasText: 'main.tf' }).first().click();
  await page.locator('.workspace-pane:not([hidden]) .monaco-editor .view-lines').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n# unsaved repository tab');
  await expect(page.locator('.workspace-repo-tabs [role="tab"]', { hasText: 'e2e-repo' }).locator('.workspace-repo-dirty')).toBeVisible();

  await openRepository(page, 'e2e-service');
  await page.locator('.workspace-repo-tabs [role="tab"]', { hasText: 'e2e-repo' }).getByRole('button').first().click();
  await expect(page.locator('.workspace-pane:not([hidden]) .monaco-editor')).toContainText('unsaved repository tab');

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Close e2e-repo' }).click();
  await expect(page.locator('.workspace-repo-tabs [role="tab"]', { hasText: 'e2e-repo' })).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Close e2e-repo' }).click();
  await expect(page.locator('.workspace-repo-tabs [role="tab"]', { hasText: 'e2e-repo' })).toHaveCount(0);
  await expect(page).toHaveURL(/#workspace\/e2e-service$/);
  expect(await page.evaluate(() => localStorage.getItem('tf9-workspace-session:e2e-repo'))).toBeNull();
});

test('restores open files and terminal tabs after navigation and reload', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  await page.locator('.rw-tree-row', { hasText: 'main.tf' }).first().click();
  await expect(page.locator('.rw-tabs')).toContainText('main.tf');

  const modules = page.locator('.rw-tree-row', { hasText: 'modules' }).first();
  page.once('dialog', dialog => dialog.accept('terminal'));
  await modules.click({ button: 'right' });
  await expect(page.locator('.rw-terminal-session-tab')).toHaveCount(2);
  await expect(page.locator('.rw-terminal-session-tab.active')).toContainText('modules 2');

  await page.goto('/#overview');
  await expect(page).toHaveURL(/#overview$/);
  await page.goto('/#workspace/e2e-repo');

  await expect(page.locator('.rw-tabs')).toContainText('main.tf');
  await expect(page.locator('.rw-terminal-session-tab')).toHaveCount(2);
  await expect(page.locator('.rw-terminal-session-tab.active')).toContainText('modules 2');

  await page.reload();
  await expect(page.locator('.rw-tabs')).toContainText('main.tf');
  await expect(page.locator('.rw-terminal-session-tab')).toHaveCount(2);
  await expect(page.locator('.rw-terminal-session-tab.active')).toContainText('modules 2');
});

test('restores an unsaved Monaco draft after leaving the workspace', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await page.locator('.rw-tree-row', { hasText: 'main.tf' }).first().click();
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n# persisted workspace draft');
  await expect(page.locator('.rw-dirty-dot')).toBeVisible();

  await page.goto('/#overview');
  await page.goto('/#workspace/e2e-repo');

  await expect(page.locator('.monaco-editor')).toContainText('persisted workspace draft');
  await expect(page.locator('.rw-dirty-dot')).toBeVisible();
});
