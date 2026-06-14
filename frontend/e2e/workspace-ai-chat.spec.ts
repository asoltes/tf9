import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.delete('/api/repos/e2e-repo/workspace/chat/reset');
  await request.put('/api/repos/e2e-repo/workspace/chat/mode', { data: { mode: 'review' } });
  await request.put('/api/repos/e2e-repo/workspace/chat/model', { data: { model: 'sonnet' } });
});

test('workspace AI chat streams and can edit the active repository', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-chat-status')).toHaveText('Claude connected');
  const model = page.getByLabel('Claude model');
  await expect(model).toHaveValue('sonnet');
  await model.selectOption('opus');
  await expect(model).toHaveValue('opus');
  await expect.poll(async () => {
    const state = await (await page.request.get('/api/repos/e2e-repo/workspace/chat')).json();
    return state.model;
  }).toBe('opus');

  const composer = page.getByRole('textbox', { name: 'Message Claude' });
  await composer.fill('Explain this workspace');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.rw-chat-message.user').last()).toContainText('Explain this workspace');
  await expect(page.locator('.rw-chat-message.assistant').last()).toContainText(
    'This workspace contains Terraform configuration',
  );

  await page.locator('.rw-chat-mode').click();
  await expect(page.locator('.rw-chat-mode')).toContainText('Auto apply');

  await composer.fill('Create ai-generated.tf');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.rw-chat-message.assistant').last()).toContainText('Created ai-generated.tf');
  await expect(page.locator('.rw-tree-row', { hasText: 'ai-generated.tf' })).toBeVisible();
});

test('workspace AI chat is isolated per repository tab', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  const composer = page.getByRole('textbox', { name: 'Message Claude' });
  await composer.fill('Explain this workspace');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.rw-chat-message.user').last()).toContainText('Explain this workspace');

  await page.getByRole('button', { name: 'Open repository' }).click();
  await page.locator('.workspace-repo-picker').getByRole('button', { name: /e2e-service/ }).click();
  await expect(page).toHaveURL(/#workspace\/e2e-service$/);
  await expect(page.locator('.workspace-pane:not([hidden]) .rw-chat-message.user')).toHaveCount(0);

  await page.locator('.workspace-repo-tabs [role="tab"]', { hasText: 'e2e-repo' })
    .getByRole('button').first().click();
  await expect(page.locator('.workspace-pane:not([hidden]) .rw-chat-message.user')).toContainText(
    'Explain this workspace',
  );
});
