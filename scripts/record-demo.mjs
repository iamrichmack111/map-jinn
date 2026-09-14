import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const root = process.cwd();
const demoDir = path.join(root, 'demo');
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
  for (let i = 0; i < 80; i++) {
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
  const launchOptions = { headless: true, args: ['--no-sandbox'] };
  if (executablePath) launchOptions.executablePath = executablePath;

  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: tmpVideoDir, size: { width: 1440, height: 1000 } }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(12_000);

  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // Use stable IDs so first-run auto-switching cannot create a selector race.
  await page.locator('#signupTab').click();
  await page.locator('#username').fill(`demo-${Date.now()}`);
  await page.locator('#password').fill('MapJinnDemo!174');
  await page.locator('#submitBtn').click();
  await page.waitForURL(url => url.pathname === '/');
  await page.locator('#mapTitle').waitFor({ state: 'visible' });
  await sleep(3500);

  await page.locator('#customLabelInput').fill('ATLANTA · FOOTPRINT STUDY');
  await sleep(2200);
  await page.locator('#coordsLabelToggle').check();
  await sleep(1800);

  // Theme transitions are nice in the demo, but GIS/CDN timing must never
  // make media generation fail. The controls are clicked by stable IDs.
  await page.locator('#themeBtn').click().catch(() => {});
  await sleep(1800);
  await page.locator('#themeBtn').click().catch(() => {});
  await sleep(1700);

  await page.locator('#areaInput').fill('30331');
  await sleep(2200);
  await page.locator('#areaInput').fill('');
  await sleep(1800);

  const video = page.video();
  await page.close();
  await context.close();

  const finalWebm = path.join(demoDir, 'map-jinn-demo.webm');
  await video.saveAs(finalWebm);

  const mp4 = path.join(demoDir, 'map-jinn-demo.mp4');
  const ff = spawn('ffmpeg', [
    '-y', '-i', finalWebm,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    mp4
  ], { stdio: 'inherit' });
  const code = await new Promise(resolve => ff.on('close', resolve));
  if (code !== 0) throw new Error(`ffmpeg conversion failed with code ${code}.`);
  if (!fs.existsSync(mp4) || fs.statSync(mp4).size < 10_000) {
    throw new Error('Demo MP4 was not created correctly.');
  }
  console.log(`Demo written to ${mp4}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (!server.killed) server.kill('SIGTERM');
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
  fs.rmSync(tmpVideoDir, { recursive: true, force: true });
}
