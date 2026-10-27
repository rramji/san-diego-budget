// Browser acceptance checks. Run from anywhere: node scripts/accept.mjs --smoke
// Not part of `npm test` (needs a browser). Override the playwright path with PLAYWRIGHT_CORE.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000;
const BASE = `http://localhost:${PORT}`;

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${BASE}/site/`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start on port ${PORT}`);
}

async function smoke(chromium) {
  const failures = [];
  const browser = await chromium.launch();
  try {
    for (const width of [375, 1200]) {
      for (const scheme of ['light', 'dark']) {
        const label = `${width}px ${scheme}`;
        const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
        await page.goto(`${BASE}/site/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#ch1-chart svg', { timeout: 10000 }).catch(() => {});
        const r = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          ch1: !!document.querySelector('#ch1-chart svg'),
          funnel: !!document.querySelector('#ch2-funnel svg'),
          claims: !!document.getElementById('ch4-claims'),
          renderErrors: document.querySelectorAll('.render-error').length,
          loadError: !document.getElementById('load-error').hidden,
        }));
        if (errors.length) failures.push(`${label}: ${errors.join('; ')}`);
        if (r.scrollWidth > r.innerWidth) failures.push(`${label}: horizontal scroll (${r.scrollWidth} > ${r.innerWidth})`);
        if (!r.ch1) failures.push(`${label}: #ch1-chart svg missing`);
        if (!r.funnel) failures.push(`${label}: #ch2-funnel svg missing`);
        if (!r.claims) failures.push(`${label}: #ch4-claims missing`);
        if (r.renderErrors) failures.push(`${label}: ${r.renderErrors} .render-error element(s)`);
        if (r.loadError) failures.push(`${label}: #load-error is showing`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  return failures;
}

async function main() {
  if (!process.argv.includes('--smoke')) {
    console.error('usage: node scripts/accept.mjs --smoke');
    process.exit(2);
  }
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE || '/home/robert/node_modules/playwright-core/index.mjs');
  // Reuse a server already on the port (it must serve the repo root); otherwise start and later stop our own.
  const running = await fetch(`${BASE}/site/`).then((r) => r.ok, () => false);
  const server = running ? null : spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  let failures;
  try {
    await waitForServer();
    failures = await smoke(chromium);
  } finally {
    if (server) server.kill();
  }
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  console.log('smoke ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
