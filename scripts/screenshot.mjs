import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://127.0.0.1:8080';

async function shot(page, name, fn) {
  await fn(page);
  await page.waitForTimeout(600);
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  saved ${name}.png`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // ── Overview ──────────────────────────────────────────────────────────────
  await shot(page, '01-overview', async p => {
    await p.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
  });

  // ── Runs list ─────────────────────────────────────────────────────────────
  await shot(page, '02-runs', async p => {
    await p.goto(`${BASE}/#runs`, { waitUntil: 'networkidle' });
    await p.waitForSelector('table.runs-tbl');
  });

  // ── Runs — split panel open (click first run if available) ────────────────
  await shot(page, '03-runs-detail', async p => {
    await p.goto(`${BASE}/#runs`, { waitUntil: 'networkidle' });
    await p.waitForSelector('table.runs-tbl');
    const firstRow = await p.$('table.runs-tbl tbody tr');
    if (firstRow) {
      await firstRow.click();
      await p.waitForTimeout(800);
    }
  });

  // ── New Run modal ─────────────────────────────────────────────────────────
  await shot(page, '04-new-run-modal', async p => {
    await p.goto(`${BASE}/#runs`, { waitUntil: 'networkidle' });
    await p.waitForSelector('button.btn-primary');
    await p.click('button.btn-primary');
    await p.waitForSelector('.modal-overlay', { state: 'visible' });
  });

  // ── Repositories ──────────────────────────────────────────────────────────
  await shot(page, '05-repositories', async p => {
    await p.goto(`${BASE}/#repos`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
  });

  // ── Config YAML editor ────────────────────────────────────────────────────
  await shot(page, '06-config-yaml', async p => {
    await p.goto(`${BASE}/#config`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
  });

  // ── Reports list ──────────────────────────────────────────────────────────
  await shot(page, '07-reports', async p => {
    await p.goto(`${BASE}/#reports`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
  });

  // ── Sidebar collapsed (runs page) ─────────────────────────────────────────
  await shot(page, '08-sidebar-collapsed', async p => {
    await p.goto(`${BASE}/#runs`, { waitUntil: 'networkidle' });
    await p.waitForSelector('button.nav-toggle-btn');
    await p.click('button.nav-toggle-btn');
    await p.waitForTimeout(300);
  });

  // ── CLI Directory Profiles ────────────────────────────────────────────────
  await shot(page, '09-profile-mappings', async p => {
    await p.goto(`${BASE}/#profile-mappings`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
  });

  // ── Logs ──────────────────────────────────────────────────────────────────
  await shot(page, '10-logs', async p => {
    await p.goto(`${BASE}/#logs`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
  });

  // ── Help ──────────────────────────────────────────────────────────────────
  await shot(page, '11-help', async p => {
    await p.goto(`${BASE}/#help`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
  });

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})();
