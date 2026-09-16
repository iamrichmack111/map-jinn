import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const root = process.cwd();
const demoDir = path.join(root, 'local-demo');
const tmpVideoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'map-jinn-video-'));
const dbPath = path.join(os.tmpdir(), `map-jinn-demo-${process.pid}.sqlite3`);
fs.mkdirSync(demoDir, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  return await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function run(cmd, args) {
  const proc = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => {
    proc.once('error', reject);
    proc.once('close', resolve);
  });
  if (code !== 0) throw new Error(`${cmd} exited with code ${code}`);
}

const port = await freePort();
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['app.py'], {
  cwd: root,
  env: { ...process.env, MAP_JINN_PORT: String(port), MAP_JINN_DB_PATH: dbPath },
  stdio: ['ignore', 'pipe', 'pipe']
});

server.stdout.on('data', chunk => process.stdout.write(chunk));
server.stderr.on('data', chunk => process.stderr.write(chunk));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${baseURL}/api/health`);
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Map Jinn server did not start.');
}

let browser;
try {
  await waitForServer();

  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);
  const executablePath = candidates.find(p => fs.existsSync(p));
  const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (executablePath) launchOptions.executablePath = executablePath;

  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: tmpVideoDir, size: { width: 1920, height: 1080 } },
    acceptDownloads: true
  });

  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  // 1. Show the real login/signup flow.
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1100);
  await page.locator('#signupTab').click();
  await page.locator('#username').fill(`demo-${Date.now()}`);
  await page.locator('#password').fill('MapJinnDemo!174');
  await sleep(800);
  await page.locator('#submitBtn').click();
  await page.waitForURL(url => url.pathname === '/');

  // 2. Wait for the actual GIS workspace to finish its first render.
  await page.locator('#mapTitle').waitFor({ state: 'visible' });
  await page.locator('#mapLoading').waitFor({ state: 'hidden', timeout: 60_000 });
  await sleep(2400);

  // 3. Demonstrate the primary feature for real: search ZIP 30331 and render it.
  await page.locator('#areaInput').fill('30331');
  await sleep(650);
  await page.locator('#goBtn').click();
  await page.waitForFunction(() => {
    const area = document.querySelector('#areaName')?.textContent || '';
    const status = document.querySelector('#searchMessage')?.textContent || '';
    return /30331/.test(area) && /selected|ready/i.test(status);
  }, null, { timeout: 60_000 });
  await sleep(3500);

  // 4. Show alternate footprint styling.
  await page.locator('[data-style="outline"]').click();
  await sleep(1800);
  await page.locator('[data-style="filled"]').click();
  await sleep(1500);

  // 5. Add print-ready apparel text and coordinates.
  await page.locator('#customLabelInput').scrollIntoViewIfNeeded();
  await page.locator('#customLabelInput').fill('ATLANTA · 30331');
  await page.locator('#coordsLabelToggle').check();
  await page.locator('#labelSizeRange').evaluate(el => {
    el.value = '34';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(3200);

  // 6. Theme transition and focus mode show the artwork clearly.
  await page.locator('#themeBtn').click();
  await sleep(2200);
  await page.locator('#themeBtn').click();
  await sleep(1600);
  await page.locator('#focusBtn').click();
  await sleep(3000);
  await page.locator('#focusBtn').click();
  await sleep(1400);

  // 7. Demonstrate PNG export without leaving a file behind in the repo.
  await page.locator('#pngBtn').scrollIntoViewIfNeeded();
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  await page.locator('#pngBtn').click();
  await downloadPromise;
  await page.waitForFunction(() => /PNG exported/i.test(document.querySelector('#exportMessage')?.textContent || ''), null, { timeout: 15_000 }).catch(() => {});
  await sleep(2600);

  const video = page.video();
  await page.close();
  await context.close();

  const finalWebm = path.join(demoDir, 'map-jinn-demo.webm');
  await video.saveAs(finalWebm);

  const mp4 = path.join(demoDir, 'map-jinn-demo.mp4');
  await run('ffmpeg', [
    '-y', '-i', finalWebm,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-an', mp4
  ]);

  if (!fs.existsSync(mp4) || fs.statSync(mp4).size < 100_000) {
    throw new Error('Demo MP4 was not created correctly.');
  }
  fs.rmSync(finalWebm, { force: true });
  console.log(`Silent demo written to ${mp4}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (!server.killed) server.kill('SIGTERM');
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
  fs.rmSync(tmpVideoDir, { recursive: true, force: true });
}
