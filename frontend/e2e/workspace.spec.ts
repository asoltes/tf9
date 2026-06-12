import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('workspace shows the repo tab, file tree and opens files', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  // Open repository tab bar reflects the active repo.
  await expect(
    page.locator('.workspace-repo-tabs [role="tab"]', { hasText: 'e2e-repo' }),
  ).toBeVisible();

  // Top-level tree entries are present.
  for (const name of ['main.tf', 'outputs.tf', 'environments', 'modules']) {
    await expect(page.locator('.rw-tree-row', { hasText: name }).first()).toBeVisible();
  }

  // Expanding a directory reveals its children.
  await page.locator('.rw-tree-row', { hasText: 'environments' }).first().click();
  await expect(page.locator('.rw-tree-row', { hasText: 'dev' }).first()).toBeVisible();

  // Opening a modified file shows it in a tab with its git decoration.
  await page.locator('.rw-tree-row', { hasText: 'main.tf' }).first().click();
  await expect(page.locator('.rw-tabs')).toContainText('main.tf');
  await expect(page.locator('.rw-tab-git').first()).toHaveText('M');
  await expect(page.locator('.rw-editor-area')).toBeVisible();
  await shot(page, 'workspace');
});

test('an open file tab can be closed', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  await page.locator('.rw-tree-row', { hasText: 'outputs.tf' }).first().click();
  const tab = page.locator('.rw-tabs', { hasText: 'outputs.tf' });
  await expect(tab).toBeVisible();

  await tab.locator('.rw-tab-close').first().click();
  await expect(page.locator('.rw-tabs')).not.toContainText('outputs.tf');
});

test('a terminal session can be terminated and reopened', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-terminal')).toBeVisible();

  await page.getByRole('button', { name: 'Terminate terminal' }).click();
  await expect(page.locator('.rw-terminal')).toHaveCount(0);

  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.locator('.rw-terminal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Terminate terminal' })).toBeVisible();
});

test('workspace items use the action modal for terminal, rename, and delete', async ({ page, request }) => {
  const entryUrl = '/api/repos/e2e-repo/workspace/entry';
  await request.delete(`${entryUrl}?path=modal-renamed`);
  await request.delete(`${entryUrl}?path=modal-test`);
  const created = await request.post(entryUrl, {
    data: { path: 'modal-test', type: 'directory' },
  });
  expect(created.ok()).toBeTruthy();

  try {
    await page.goto('/#workspace/e2e-repo');
    await expect(page.locator('.rw-workbench')).toBeVisible();

    const testFolder = page.locator('.rw-tree-row', {
      has: page.locator('.rw-entry-name', { hasText: /^modal-test$/ }),
    });
    await testFolder.click({ button: 'right' });

    const actions = page.getByRole('dialog', { name: 'Workspace item actions' });
    await expect(actions).toBeVisible();
    await expect(actions.getByRole('button', { name: /Open terminal/ })).toBeVisible();
    await expect(actions.getByRole('button', { name: /Rename/ })).toBeVisible();
    await expect(actions.getByRole('button', { name: /Delete/ })).toBeVisible();

    await actions.getByRole('button', { name: /Rename/ }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename folder' });
    await renameDialog.getByLabel('New path').fill('modal-renamed');
    await renameDialog.getByRole('button', { name: 'Rename', exact: true }).click();

    const renamedFolder = page.locator('.rw-tree-row', {
      has: page.locator('.rw-entry-name', { hasText: /^modal-renamed$/ }),
    });
    await expect(renamedFolder).toBeVisible();
    await renamedFolder.click({ button: 'right' });
    await page.getByRole('dialog', { name: 'Workspace item actions' })
      .getByRole('button', { name: /Delete/ }).click();

    const deleteDialog = page.getByRole('dialog', { name: 'Delete folder' });
    await expect(deleteDialog).toContainText('cannot be undone');
    await deleteDialog.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(renamedFolder).toHaveCount(0);
  } finally {
    await request.delete(`${entryUrl}?path=modal-renamed`);
    await request.delete(`${entryUrl}?path=modal-test`);
  }
});
