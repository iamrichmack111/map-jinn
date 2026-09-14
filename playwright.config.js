const { defineConfig } = require('@playwright/test');
const fs = require('fs');

function systemChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p));
}

const executablePath = systemChromium();

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5333',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] }
  },
  webServer: {
    command: 'MAP_JINN_PORT=5333 MAP_JINN_DB_PATH=/tmp/map-jinn-playwright.sqlite3 python3 app.py',
    url: 'http://127.0.0.1:5333/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
