import { expect, test } from '@playwright/test';

test('Git diff stays usable across open, close, reopen, and resize', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');

  const workbench = page.locator('.rw-workbench');
  await expect(workbench).toBeVisible();

  const modifiedFile = page.locator('.rw-tree-row', { hasText: 'main.tf' });
  await expect(modifiedFile).toBeVisible();
  await expect(modifiedFile.locator('.rw-git-decoration')).toHaveText('M');
  await modifiedFile.click();

  await expect(page.locator('.rw-tab-git')).toHaveText('M');

  const diffPanel = page.locator('.rw-diff');
  await expect(diffPanel).toBeVisible();
  await expect(diffPanel.locator('.rw-diff-deletion')).not.toHaveCount(0);
  await expect(diffPanel.locator('.rw-diff-addition')).not.toHaveCount(0);

  const diffToggle = page.getByRole('button', { name: 'Toggle Git diff' });
  await expect(diffToggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close Git diff' }).click();
  await expect(diffPanel).toBeHidden();
  await expect(diffToggle).toHaveAttribute('aria-pressed', 'false');

  await diffToggle.click();
  await expect(diffPanel).toBeVisible();
  await expect(diffToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(diffPanel.locator('.rw-diff-addition')).not.toHaveCount(0);

  const widthLabel = page.locator('.rw-diff-size');
  const initialWidth = Number.parseInt((await widthLabel.textContent()) || '', 10);
  expect(initialWidth).toBe(380);
  const initialBox = await diffPanel.boundingBox();
  const resizeHandle = page.locator('.rw-diff-resizer');
  const handleBox = await resizeHandle.boundingBox();
  expect(initialBox).not.toBeNull();
  expect(handleBox).not.toBeNull();

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 100);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 120, handleBox!.y + 100, { steps: 6 });
  await page.mouse.up();

  const resizedWidth = Number.parseInt((await widthLabel.textContent()) || '', 10);
  const resizedBox = await diffPanel.boundingBox();
  expect(resizedWidth).toBeGreaterThan(initialWidth);
  expect(resizedBox!.width).toBeGreaterThan(initialBox!.width);

  await page.getByRole('button', { name: 'Narrower' }).click();
  await expect(widthLabel).toHaveText(`${resizedWidth - 80}px`);

  const untrackedFile = page.locator('.rw-tree-row', { hasText: 'outputs.tf' });
  await expect(untrackedFile.locator('.rw-git-decoration')).toHaveText('U');
});

test('opens a selected directory in a new terminal session', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept('terminal');
  });
  await page.locator('.rw-tree-row', { hasText: 'modules' }).click({ button: 'right' });

  const terminal = page.locator('.rw-terminal-host');
  await expect(terminal).toContainText('/tmp/tfops-playwright/repo/modules');
  await expect(page.locator('.rw-terminal-shell')).toHaveText('modules');
});
