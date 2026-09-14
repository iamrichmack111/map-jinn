import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = process.cwd();
const demoDir = path.join(root, 'demo');
const tmpVideoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'map-jinn-video-'));
const dbPath = path.join(os.tmpdir(), `map-jinn-demo-${process.pid}.sqlite3`);
fs.mkdirSync(demoDir, { recursive: true });

const server = spawn('python3', ['app.py'], {
  cwd: root,
  env: { ...process.env, MAP_JINN_PORT: '5333', MAP_JINN_DB_PATH: dbPath },
  stdio: ['ignore', 'pipe', 'pipe']
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:5333/api/health');
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Map Jinn server did not start.');
}

let browser;
try {
  await waitForServer();
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean);
  const executablePath = candidates.find(p => fs.existsSync(p));
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: tmpVideoDir, size: { width: 1440, height: 1000 } }
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5333/login');
  await sleep(1200);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.locator('#username').fill(`demo-${Date.now()}`);
  await page.locator('#password').fill('MapJinnDemo!174');
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await page.waitForURL('**/');
  await sleep(4500);
  await page.locator('#customLabelInput').fill('ATLANTA · FOOTPRINT STUDY');
  await sleep(2200);
  await page.locator('#coordsLabelToggle').check();
  await sleep(2200);
  await page.getByRole('button', { name: 'Paper mode' }).click();
  await sleep(2200);
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await sleep(1800);
  const video = page.video();
  await context.close();
  const webm = await video.path();
  const finalWebm = path.join(demoDir, 'map-jinn-demo.webm');
  fs.copyFileSync(webm, finalWebm);

  const mp4 = path.join(demoDir, 'map-jinn-demo.mp4');
  const ff = spawn('ffmpeg', ['-y', '-i', finalWebm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  const code = await new Promise(resolve => ff.on('close', resolve));
  if (code !== 0) throw new Error('ffmpeg conversion failed.');
  console.log(`Demo written to ${mp4}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
}
