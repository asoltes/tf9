import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('overview hub renders all cards', async ({ page }) => {
  await page.goto('/#overview');
  await expect(page.locator('.hub-hero h1')).toHaveText('tf9');
  await expect(page.locator('.hub-card')).toHaveCount(6);
  await shot(page, 'overview-hub');
});

const cards: { href: string; expect: string }[] = [
  { href: '#runs', expect: '.runs-page' },
  { href: '#repos', expect: '.page-title:has-text("Repositories")' },
  { href: '#config', expect: '.config-page' },
  { href: '#reports', expect: '.reports-page' },
  { href: '#help', expect: '.help-page' },
];

for (const c of cards) {
  test(`hub card ${c.href} navigates`, async ({ page }) => {
    await page.goto('/#overview');
    await page.locator(`a.hub-card[href="${c.href}"]`).click();
    await expect(page.locator(c.expect).first()).toBeVisible();
  });
}

test('hub "New run" card opens the new run modal', async ({ page }) => {
  await page.goto('/#overview');
  await page.locator('a.hub-card[href="#runs/new"]').click();
  await expect(page.locator('.run-modal[role="dialog"]')).toBeVisible();
});
