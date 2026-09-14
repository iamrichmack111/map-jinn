async function createAccount(page, prefix = 'playwright') {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#signupTab').click();
  const username = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await page.locator('#username').fill(username);
  await page.locator('#password').fill('MapJinnTest!174');
  await page.locator('#submitBtn').click();
  await page.waitForURL(url => url.pathname === '/');
  await page.locator('#mapTitle').waitFor({ state: 'visible' });
  return username;
}

async function waitForMapShell(page) {
  await page.locator('#viewDiv').waitFor({ state: 'visible' });
  await page.locator('#areaInput').waitFor({ state: 'visible' });
  // External GIS timing is intentionally not an assertion in CI.
  await page.waitForTimeout(1200);
}

module.exports = { createAccount, waitForMapShell };
