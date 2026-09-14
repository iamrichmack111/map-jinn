const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { createAccount, waitForMapShell } = require('./helpers');

const out = path.join(process.cwd(), 'docs', 'screenshots');

test('@media capture login and main footprint workspace', async ({ page }) => {
  fs.mkdirSync(out, { recursive: true });
  await page.goto('/login');
  await page.screenshot({ path: path.join(out, '01-login.png'), fullPage: true });

  await createAccount(page, 'shot');
  await waitForMapShell(page);
  await page.locator('#customLabelInput').fill('ATLANTA · FOOTPRINT STUDY');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, '02-workspace.png'), fullPage: true });
  await page.locator('.map-stage').screenshot({ path: path.join(out, '03-footprint-map.png') });
});
