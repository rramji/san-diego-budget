// Browser acceptance checks. Run from anywhere:
//   node scripts/accept.mjs --smoke   load the page at 375/1200 px, light and dark; no errors, no horizontal scroll
//   node scripts/accept.mjs           smoke plus the section checks below and their screenshots
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

const SHOTS = path.join(ROOT, 'docs', 'screenshots');

// Section 1: pots bar, twin maps, panel. At 375 and 1200, light; plus a 375 dark screenshot.
async function section1(chromium) {
  const failures = [];
  const browser = await chromium.launch();
  try {
    for (const [width, scheme, shot] of [[375, 'light', 'v2-s1-375'], [1200, 'light', 'v2-s1-1200'], [375, 'dark', 'v2-s1-375-dark']]) {
      const label = `s1 ${width}px ${scheme}`;
      const fail = (m) => failures.push(`${label}: ${m}`);
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await page.goto(`${BASE}/site/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#s1-maps .cell', { timeout: 10000 }).catch(() => {});
      const crumbs = () => page.$$eval('#s1-maps .crumbs', (els) => els.map((e) => e.textContent.trim()));
      const heads = () => page.$$eval('#s1-maps .map-head', (els) => els.map((e) => e.textContent.trim()));
      const title = () => page.$eval('#s1-panel .panel-title', (e) => e.textContent.trim()).catch(() => null);

      // On load: General Fund selected, its pot panel showing, panel not yet a live region.
      const load = await page.evaluate(() => ({
        pressed: [...document.querySelectorAll('#s1-pots .pot[aria-pressed="true"]')].map((g) => g.dataset.pot),
        segs: document.querySelectorAll('#s1-pots .pot[role="button"][tabindex="0"]').length,
        live: document.getElementById('s1-panel').getAttribute('aria-live'),
        hlFigs: document.querySelectorAll('[data-hl-fig]').length,
      }));
      if (load.segs !== 5) fail(`expected 5 pot buttons, got ${load.segs}`);
      if (load.pressed.join() !== 'general_fund') fail(`selected pot on load is ${load.pressed.join() || 'none'}`);
      if ((await title()) !== 'General Fund') fail(`panel on load is "${await title()}"`);
      if (load.live) fail('panel is a live region before any user action');
      if (load.hlFigs) fail(`${load.hlFigs} [data-hl-fig] placeholder(s) not filled`);

      // Utilities: both maps reset to one step and state their own detail year.
      await page.click('#s1-pots .pot[data-pot="utilities"]');
      const uc = await crumbs();
      if (uc.length !== 2 || uc.some((c) => c.includes('›'))) fail(`utilities crumbs not one step: ${JSON.stringify(uc)}`);
      const uh = await heads();
      if (uh.length !== 2 || !uh.every((h) => /FY2026 detail/.test(h))) fail(`utilities headers: ${JSON.stringify(uh)}`);
      if ((await page.$eval('#s1-panel', (e) => e.getAttribute('aria-live'))) !== 'polite') fail('panel not polite after a user action');

      // General Fund, then Police in money out.
      await page.click('#s1-pots .pot[data-pot="general_fund"]');
      await page.click('#s1-maps .map-col[data-side="out"] .cell[aria-label^="Police,"]');
      const pc = await crumbs();
      if (pc[1] !== 'General Fund money out › Police') fail(`crumb after Police: "${pc[1]}"`);
      if ((await title()) !== 'Police') fail(`panel after Police: "${await title()}"`);
      const focusedFirst = await page.evaluate(() => {
        const a = document.activeElement;
        return !!a && a === document.querySelector('#s1-maps .map-col[data-side="out"] .cell');
      });
      if (!focusedFirst) fail('focus did not move to the first box of the opened level');

      // Enter on a focused leaf: the panel changes, the path does not, focus stays on that box.
      const leaf = page.locator('#s1-maps .map-col[data-side="out"] .cell[data-opens="false"]').first();
      const leafName = (await leaf.getAttribute('aria-label')).split(',')[0];
      await leaf.focus();
      await page.keyboard.press('Enter');
      if ((await title()) !== leafName) fail(`panel after Enter on leaf: "${await title()}", expected "${leafName}"`);
      const lc = await crumbs();
      if (JSON.stringify(lc) !== JSON.stringify(pc)) fail(`crumbs changed on a leaf: ${JSON.stringify(lc)}`);
      const kept = await page.evaluate((n) => document.activeElement?.getAttribute('aria-label')?.startsWith(`${n},`), leafName);
      if (!kept) fail('focus left the leaf box after Enter');

      // A crumb link goes back up.
      await page.click('#s1-maps .map-col[data-side="out"] .crumb');
      const bc = await crumbs();
      if (bc[1] !== 'General Fund money out') fail(`crumb link did not go back up: "${bc[1]}"`);

      // Labels never overflow their boxes; every box has positive size and a full aria-label.
      const geo = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('#s1-maps .cell, #s1-pots .pot').forEach((g) => {
          const r = g.querySelector('rect').getBBox();
          if (!(r.width > 0 && r.height > 0)) bad.push(`zero box ${g.getAttribute('aria-label')}`);
          if (!/\$/.test(g.getAttribute('aria-label') || '')) bad.push(`aria-label without amount: ${g.getAttribute('aria-label')}`);
          g.querySelectorAll('text').forEach((t) => {
            const b = t.getBBox();
            if (b.x < r.x - 0.5 || b.y < r.y - 0.5 || b.x + b.width > r.x + r.width + 0.5 || b.y + b.height > r.y + r.height + 0.5) {
              bad.push(`label "${t.textContent}" overflows ${g.getAttribute('aria-label')}`);
            }
          });
        });
        return bad;
      });
      for (const g of geo) fail(g);

      // Every figure is sourced and has a footnote button; nothing scrolls sideways.
      const src = await page.evaluate(() => ({
        unsourced: document.querySelectorAll('.figure:not([data-src-url])').length,
        noFn: [...document.querySelectorAll('[data-src-url]')].filter((e) => !(e.nextElementSibling && e.nextElementSibling.classList.contains('fn'))).length,
        scroll: document.documentElement.scrollWidth - window.innerWidth,
      }));
      if (src.unsourced) fail(`${src.unsourced} .figure without data-src-url`);
      if (src.noFn) fail(`${src.noFn} sourced element(s) without a footnote button`);
      if (src.scroll > 0) fail(`horizontal scroll (${src.scroll}px)`);

      // Screenshot: General Fund money out opened at Police, a leaf selected.
      await page.click('#s1-maps .map-col[data-side="out"] .cell[aria-label^="Police,"]');
      await page.locator('#s1-maps .map-col[data-side="out"] .cell[data-opens="false"]').first().click();
      // Grow the viewport to the section, then clip. Element and fullPage captures resize the viewport mid-shot, which
      // re-renders the maps at another width.
      const box = await page.evaluate(() => {
        const r = document.getElementById('what').getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
      });
      await page.setViewportSize({ width, height: Math.ceil(box.y + box.height) });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: path.join(SHOTS, `${shot}.png`), clip: box });
      if (errors.length) fail(errors.join('; '));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return failures;
}

async function main() {
  const smokeOnly = process.argv.includes('--smoke');
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE || '/home/robert/node_modules/playwright-core/index.mjs');
  // Reuse a server already on the port (it must serve the repo root); otherwise start and later stop our own.
  const running = await fetch(`${BASE}/site/`).then((r) => r.ok, () => false);
  const server = running ? null : spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  let failures;
  try {
    await waitForServer();
    failures = await smoke(chromium);
    if (!smokeOnly) failures.push(...(await section1(chromium)));
  } finally {
    if (server) server.kill();
  }
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  console.log(smokeOnly ? 'smoke ok' : 'accept ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
