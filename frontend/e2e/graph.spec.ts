import { expect, test } from '@playwright/test';

test('completed plan is available in Graph View', async ({ page }) => {
  const created = await page.request.post('/api/runs', {
    data: {
      command: 'plan', repo: 'e2e-repo', envFilter: 'dev', profile: '',
      extraArgs: [], nonprodOnly: false, autoApprove: false, parallel: false,
      promotionOrder: [],
    },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json() as { id: string };
  await expect.poll(async () => {
    const response = await page.request.get(`/api/runs/${id}`);
    const run = await response.json() as { status: string };
    return run.status;
  }).toBe('success');

  await page.goto(`/#graph?run=${id}`);
  await expect(page.locator('.graph-page')).toBeVisible();
  await expect(page.locator('.gv-canvas canvas')).toBeVisible();
  await expect(page.locator('.gv-toolbar .gv-filter-item')).toHaveCount(5);
  await expect(page.locator('.gv-filter-item').filter({ hasText: 'Create' })).toContainText('1');
  await expect(page.getByLabel('Terraform summary')).toHaveCount(0);
  await expect(page.locator('.gv-impact-chip')).toHaveCount(0);
  await expect(page.locator('.gv-legend')).toHaveCount(0);
  await page.getByRole('button', { name: 'Lists' }).click();
  await expect(page.locator('.gv-node-list')).toContainText('e2e-repo');
  await expect(page.locator('.gv-node-item.kind-managed')).toContainText('terraform_data.demo');
  await expect(page.getByLabel('Graph layout')).toHaveValue('force');
  await page.locator('.gv-node-item.kind-managed').click();
  await expect(page.locator('.gv-details')).toContainText('What changed');
  await expect(page.locator('.gv-details')).toContainText('input');
  await expect(page.locator('.gv-details')).toContainText('terraform plan');
  await expect(page.locator('.gv-result')).toContainText('# terraform_data.demo will be created');
  await expect(page.locator('.gv-result')).toContainText('input');
  await expect(page.locator('.gv-count')).toContainText(/· [1-9]\d* highlighted/);
  await page.getByLabel('Node shape').selectOption('circle');
  await expect(page.getByLabel('Node shape')).toHaveValue('circle');
  await page.getByRole('button', { name: 'Controls' }).click();
  await expect(page.getByRole('complementary', { name: 'Graph controls' })).toBeVisible();
  await page.getByLabel('Node size').fill('1.4');
  await expect(page.getByLabel('Node size')).toHaveValue('1.4');
  const changedOnly = page.locator('.gv-switch-row').filter({ hasText: 'Changed nodes only' }).locator('input');
  await changedOnly.check();
  await expect(changedOnly).toBeChecked();
});

test('Graph View automatically follows a newly created plan', async ({ page }) => {
  await page.goto('/#graph');
  await expect(page.locator('.graph-page')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Following latest' })).toBeVisible();

  const created = await page.request.post('/api/runs', {
    data: {
      command: 'plan', repo: 'e2e-repo', envFilter: 'prod', profile: '',
      extraArgs: [], nonprodOnly: false, autoApprove: false, parallel: false,
      promotionOrder: [],
    },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json() as { id: string };

  await expect(page.locator('.graph-run-select select')).toHaveValue(id, { timeout: 8000 });
  await expect(page.locator('.gv-node-list')).toContainText('prod', { timeout: 8000 });
});
