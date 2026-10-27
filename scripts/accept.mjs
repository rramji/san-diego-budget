// Browser acceptance checks. Run from anywhere:
//   node scripts/accept.mjs --smoke   load the page at 375/1200 px, light and dark; no errors, no horizontal scroll
//   node scripts/accept.mjs           smoke plus the section checks below (sections 1 to 4) and their screenshots
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
        statusLive: document.getElementById('s1-status')?.getAttribute('aria-live'),
        statusText: document.getElementById('s1-status')?.textContent,
        statusParent: document.getElementById('s1-status')?.parentElement.id,
        hlFigs: document.querySelectorAll('[data-hl-fig]').length,
      }));
      if (load.segs !== 5) fail(`expected 5 pot buttons, got ${load.segs}`);
      if (load.pressed.join() !== 'general_fund') fail(`selected pot on load is ${load.pressed.join() || 'none'}`);
      if ((await title()) !== 'General Fund') fail(`panel on load is "${await title()}"`);
      if (load.live) fail('panel has aria-live (announcements go through #s1-status, ruling R13)');
      if (load.statusParent !== 'what') fail(`#s1-status missing or not a direct child of #what (${load.statusParent})`);
      if (load.statusLive !== 'polite') fail(`#s1-status should be polite from load (R13a), is ${load.statusLive}`);
      if (load.statusText) fail(`status speaks before any user action: "${load.statusText}"`);
      const status = () => page.$eval('#s1-status', (e) => [e.getAttribute('aria-live'), e.textContent]);
      const waitStatus = async (re) => {
        await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('s1-status').textContent), re.source, { timeout: 2000 }).catch(() => {});
        const [live, text] = await status();
        if (live !== 'polite' || !re.test(text)) fail(`status is ${live}/"${text}", expected polite ${re}`);
      };
      if (load.hlFigs) fail(`${load.hlFigs} [data-hl-fig] placeholder(s) not filled`);

      // Utilities: both maps reset to one step and state their own detail year.
      await page.click('#s1-pots .pot[data-pot="utilities"]');
      const uc = await crumbs();
      if (uc.length !== 2 || uc.some((c) => c.includes('›'))) fail(`utilities crumbs not one step: ${JSON.stringify(uc)}`);
      const uh = await heads();
      if (uh.length !== 2 || !uh.every((h) => /FY2026 detail/.test(h))) fail(`utilities headers: ${JSON.stringify(uh)}`);
      await waitStatus(/^Utilities, \$1\.92B, FY2027$/);

      // General Fund, then Police in money out.
      await page.click('#s1-pots .pot[data-pot="general_fund"]');
      await page.click('#s1-maps .map-col[data-side="out"] .cell[aria-label^="Police,"]');
      const pc = await crumbs();
      if (pc[1] !== 'General Fund money out › Police') fail(`crumb after Police: "${pc[1]}"`);
      if ((await title()) !== 'Police') fail(`panel after Police: "${await title()}"`);
      await waitStatus(/^Police, \$718M, FY2027, opened$/);
      // On a phone the panel sits under the map just used; at desktop width it stays below both maps.
      const where = await page.evaluate(() => {
        const p = document.getElementById('s1-panel');
        return { parent: p.parentElement.dataset.side || p.parentElement.id, prev: p.previousElementSibling?.className, live: p.getAttribute('aria-live') };
      });
      const want = width < 640 ? { parent: 'out', prev: 'map-box' } : { parent: 'what', prev: 'chart' };
      if (where.parent !== want.parent || where.prev !== want.prev) fail(`panel placed at ${JSON.stringify(where)}, expected ${JSON.stringify(want)}`);
      if (where.live) fail('panel has aria-live after an action');
      // Re-rendering the same map must not detach the panel (ruling R13).
      await page.evaluate(() => {
        window.__panelDetached = 0;
        const p = document.getElementById('s1-panel');
        new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n === p) window.__panelDetached += 1; })
          .observe(document.getElementById('what'), { childList: true, subtree: true });
      });
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
      await waitStatus(new RegExp(`^${leafName.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&')}, \\$`));
      if (width < 640 && (await page.evaluate(() => window.__panelDetached))) fail('the panel was detached by a re-render of its own map');
      // Keyboard focus shows the two-tone overlay outside the box; a click does not.
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const o = document.querySelector('#s1-maps .map-col[data-side="out"] .focus-ring');
        return !!o && !o.hasAttribute('display') && document.activeElement.classList.contains('cell');
      });
      if (!ring) fail('no focus ring overlay after Tab to the next box');

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

// Section 2: cents bar, six blocks, rate bars, quote, dig deeper. Checks at 375 and 1200; screenshots at 375 light and dark.
async function section2(chromium) {
  const failures = [];
  const browser = await chromium.launch();
  try {
    for (const [width, scheme, shot] of [[375, 'light', 'v2-s2-375'], [375, 'dark', 'v2-s2-375-dark'], [1200, 'light', null]]) {
      const label = `s2 ${width}px ${scheme}`;
      const fail = (m) => failures.push(`${label}: ${m}`);
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await page.goto(`${BASE}/site/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#s2-cents svg', { timeout: 10000 }).catch(() => {});
      const r = await page.evaluate(() => {
        const sec = document.getElementById('why-short');
        const lead = sec.querySelector('.lead');
        const segs = [...sec.querySelectorAll('#s2-cents .cents-seg')];
        const overflow = [];
        segs.forEach((g) => {
          const b = g.querySelector('rect').getBBox();
          g.querySelectorAll('text').forEach((t) => {
            const tb = t.getBBox();
            if (tb.x < b.x - 0.5 || tb.x + tb.width > b.x + b.width + 0.5) overflow.push(t.textContent);
          });
        });
        const rows = [...sec.querySelectorAll('.rate-bars li')];
        return {
          placeholder: sec.querySelectorAll('[data-lead="placeholder"], [data-why-fig]').length,
          leadFirstFig: lead.querySelector('.figure')?.textContent,
          leadSentences: (lead.textContent.match(/[.!?](\s|$)/g) || []).length,
          hi: sec.querySelectorAll('#s2-cents .cents-seg.is-hi').length,
          hiLabel: sec.querySelector('#s2-cents .cents-seg.is-hi title')?.textContent,
          legend: sec.querySelectorAll('#s2-cents .cents-legend li').length,
          caption: sec.querySelector('#s2-cents figcaption')?.textContent || '',
          overflow,
          blocks: [...sec.querySelectorAll('#s2-blocks .why-block > h3')].map((h) => h.textContent),
          rows: rows.map((li) => [li.querySelector('.rb-city').textContent, li.classList.contains('is-hi'), li.querySelector('.rb-bar').getBoundingClientRect().width]),
          quote: !!sec.querySelector('#s2-blocks blockquote footer [data-src-url]'),
          dig: sec.querySelectorAll('#s2-dig .figure').length,
          ours: [...sec.querySelectorAll('.figure')].filter((f) => f.dataset.srcDoc.startsWith('our arithmetic'))
            .filter((f) => !/our arithmetic/.test(f.closest('li, p')?.textContent || '')).map((f) => f.textContent),
          unsourced: sec.querySelectorAll('.figure:not([data-src-url])').length,
          noFn: [...sec.querySelectorAll('[data-src-url]')].filter((e) => !(e.nextElementSibling && e.nextElementSibling.classList.contains('fn'))).length,
          perCapita: /per (person|capita|resident)/i.test(sec.textContent),
          scroll: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      if (r.placeholder) fail(`${r.placeholder} placeholder(s) left in #why-short`);
      if (r.leadFirstFig !== '17.8¢') fail(`lead's first figure is "${r.leadFirstFig}", expected 17.8¢`);
      if (r.leadSentences < 2 || r.leadSentences > 4) fail(`lead has ${r.leadSentences} sentences`);
      if (r.hi !== 1 || !/^Cities: 17\.8¢$/.test(r.hiLabel || '')) fail(`highlight: ${r.hi} segment(s), "${r.hiLabel}"`);
      if (r.legend < 6) fail(`legend lists ${r.legend} segments`);
      if (!/average for all the cities/.test(r.caption)) fail(`caption does not say it is the countywide average for cities: "${r.caption}"`);
      for (const t of r.overflow) fail(`cents label "${t}" overflows its segment`);
      const want = ['Property tax', 'Sales tax', 'Hotel tax', 'Trash', 'Costs', 'IBA'];
      if (r.blocks.length !== 6 || !want.every((w, i) => r.blocks[i]?.includes(w))) fail(`blocks: ${JSON.stringify(r.blocks)}`);
      const cities = r.rows.map((x) => x[0]);
      if (cities.join() !== 'Oakland,Los Angeles,San Jose,Sacramento,San Francisco,San Diego') fail(`rate bars: ${cities.join()}`);
      if (r.rows.filter((x) => x[1]).map((x) => x[0]).join() !== 'San Diego') fail('rate bars: San Diego is not the one highlight');
      if (r.rows.some((x, i) => i && x[2] > r.rows[i - 1][2] + 0.5)) fail('rate bars are not sorted by width');
      if (!r.quote) fail('IBA quote has no sourced cite');
      if (r.dig < 5) fail(`dig deeper has ${r.dig} figures`);
      if (r.ours.length) fail(`our-arithmetic figures without the words on screen: ${r.ours.join(', ')}`);
      if (r.unsourced) fail(`${r.unsourced} .figure without data-src-url`);
      if (r.noFn) fail(`${r.noFn} sourced element(s) without a footnote button`);
      if (r.perCapita) fail('section mentions a per-person comparison');
      if (r.scroll > 0) fail(`horizontal scroll (${r.scroll}px)`);
      if (shot) {
        await page.evaluate(() => { document.querySelector('#why-short details.dig').open = true; });
        const box = await page.evaluate(() => {
          const el = document.getElementById('why-short').getBoundingClientRect();
          return { x: el.left + window.scrollX, y: el.top + window.scrollY, width: el.width, height: el.height };
        });
        await page.setViewportSize({ width, height: Math.ceil(box.y + box.height) });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: path.join(SHOTS, `${shot}.png`), clip: box });
      }
      if (errors.length) fail(errors.join('; '));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return failures;
}

// Section 3: three headline cards, the waterfall, the residual, the debt box, and the dig deeper (definitions,
// timeline, funnel). Checks at 375 and 1200; screenshots of the whole section, dig deeper open, at 375 light and dark.
async function section3(chromium) {
  const failures = [];
  const browser = await chromium.launch();
  try {
    for (const [width, scheme, shot] of [[375, 'light', 'v2-s3-375'], [375, 'dark', 'v2-s3-375-dark'], [1200, 'light', null]]) {
      const label = `s3 ${width}px ${scheme}`;
      const fail = (m) => failures.push(`${label}: ${m}`);
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await page.goto(`${BASE}/site/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#s3-waterfall svg', { timeout: 10000 }).catch(() => {});
      const overlaps = (sel) => `(() => { const r = [...document.querySelectorAll('${sel}')].map((e) => e.getBoundingClientRect());
        const out = []; for (let i = 0; i < r.length; i += 1) for (let j = i + 1; j < r.length; j += 1) {
          const a = r[i], b = r[j]; if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) out.push([i, j]); }
        return out; })()`;
      const r = await page.evaluate((ov) => {
        const sec = document.getElementById('gap');
        const lead = sec.querySelector('.lead');
        const cards = [...sec.querySelectorAll('#s3-headlines .hl-card')].map((c) => c.getBoundingClientRect());
        const pair = [...sec.querySelectorAll('.hl-pair .hl-num')];
        const steps = [...sec.querySelectorAll('#s3-waterfall .wf-step')].map((li) => li.textContent);
        const svg = sec.querySelector('#s3-waterfall svg')?.getBoundingClientRect();
        const vals = [...sec.querySelectorAll('#s3-waterfall .wf-val')].map((t) => t.getBoundingClientRect());
        return {
          placeholder: sec.querySelectorAll('[data-lead="placeholder"], [data-gap-fig]').length,
          leadFig: lead.querySelector('.figure')?.textContent,
          leadSentences: (lead.textContent.match(/[.!?](\s|$)/g) || []).length,
          cards: cards.map((c) => [Math.round(c.left), Math.round(c.top)]),
          questions: [...sec.querySelectorAll('.hl-q')].map((q) => q.textContent),
          pair: pair.map((n) => [n.textContent.replace(/¹/g, ''), getComputedStyle(n).fontSize, Math.round(n.getBoundingClientRect().top)]),
          sett: sec.querySelectorAll('.hl-sett li').length,
          cardOverflow: [...sec.querySelectorAll('.hl-card .hl-num')].filter((n) => { const c = n.closest('.hl-pair > div') || n.closest('.hl-card'); const fn = n.querySelector('.fn') || n; return fn.getBoundingClientRect().right > c.getBoundingClientRect().right + 0.5; }).map((n) => n.textContent),
          note: sec.querySelector('.hl-note')?.textContent || '',
          steps,
          hatched: sec.querySelectorAll('#s3-waterfall .wf-bar.is-ours rect[fill^="url("]').length,
          valsOut: svg ? vals.filter((v) => v.left < svg.left - 1 || v.right > svg.right + 1 || v.top < svg.top - 1).length : -1,
          valOverlap: eval(ov.vals),
          after: sec.querySelector('.wf-after')?.textContent || '',
          residual: sec.querySelector('#s3-residual')?.textContent || '',
          debtLinks: [...sec.querySelectorAll('#s3-debt a')].map((a) => a.getAttribute('href')),
          ours: [...sec.querySelectorAll('.figure')].filter((f) => f.dataset.srcDoc.startsWith('our arithmetic'))
            .filter((f) => !/our arithmetic/.test(f.closest('li, p')?.textContent || '')).map((f) => f.textContent),
        };
      }, { vals: overlaps('#s3-waterfall .wf-val') });
      if (r.placeholder) fail(`${r.placeholder} placeholder(s) left in #gap`);
      if (r.leadFig !== '$118M') fail(`lead's first figure is "${r.leadFig}"`);
      if (r.leadSentences < 2 || r.leadSentences > 4) fail(`lead has ${r.leadSentences} sentences`);
      if (r.cards.length !== 3) fail(`${r.cards.length} headline cards`);
      const row = new Set(r.cards.map((c) => c[1])).size === 1 && new Set(r.cards.map((c) => c[0])).size === 3;
      const stack = new Set(r.cards.map((c) => c[0])).size === 1;
      if (width < 640 ? !stack : !row) fail(`cards ${width < 640 ? 'do not stack' : 'not in a row'}: ${JSON.stringify(r.cards)}`);
      if (r.questions.join('|') !== 'How big was it this year?|How bad did it get?|What’s coming?') fail(`questions: ${r.questions}`);
      if (r.pair.length !== 2 || r.pair[0][0] !== '$9.5M' || r.pair[1][0] !== '$32.9M' || r.pair[0][1] !== r.pair[1][1] || r.pair[0][2] !== r.pair[1][2]) {
        fail(`FY2028 pair not side by side at equal size: ${JSON.stringify(r.pair)}`);
      }
      if (r.cardOverflow.length) fail(`headline numbers overflow their card: ${r.cardOverflow.join(', ')}`);
      if (r.sett !== 2) fail(`${r.sett} settlement items`);
      if (!/November 6, 2026/.test(r.note)) fail(`note: "${r.note}"`);
      if (r.steps.length !== 9) fail(`${r.steps.length} waterfall steps`);
      if (r.steps.filter((t) => /\(our arithmetic\)/.test(t)).length !== 1) fail('waterfall: not exactly one "(our arithmetic)" step');
      if (r.hatched !== 1) fail(`${r.hatched} hatched bars`);
      if (r.valsOut) fail(`${r.valsOut} waterfall value label(s) outside the chart`);
      if (r.valOverlap.length) fail(`waterfall value labels overlap: ${JSON.stringify(r.valOverlap)}`);
      if (!/133\.66/.test(r.after)) fail(`adopted note: "${r.after}"`);
      if (!/about \$103M.*\(our arithmetic\)/.test(r.residual)) fail('residual: ~$103M is not labeled our arithmetic');
      if (r.debtLinks.join() !== '#reserves,#infrastructure,#pension') fail(`debt box links: ${r.debtLinks}`);
      if (r.ours.length) fail(`our-arithmetic figures without the words on screen: ${r.ours.join(', ')}`);

      // Dig deeper: open it, then the timeline and the funnel draw at the open width.
      await page.evaluate(() => { document.querySelector('#gap details.dig').open = true; });
      await page.waitForSelector('#s3-timeline .tl-pt', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
      const d = await page.evaluate((ov) => {
        const sec = document.getElementById('gap');
        const host = sec.querySelector('#s3-timeline .tl-host');
        const funnel = sec.querySelector('#ch2-funnel');
        const fsvg = funnel.querySelector('svg');
        return {
          defs: [...sec.querySelectorAll('.gap-defs dt')].map((x) => x.textContent),
          points: sec.querySelectorAll('#s3-timeline .tl-pt').length,
          ptOverlap: eval(ov.pts),
          ptOut: [...sec.querySelectorAll('#s3-timeline .tl-pt')].filter((p) => p.getBoundingClientRect().right > host.getBoundingClientRect().right + 1).length,
          funnelW: fsvg ? Math.round(fsvg.getBoundingClientRect().width) : 0,
          funnelBox: Math.round(funnel.getBoundingClientRect().width),
          unsourced: sec.querySelectorAll('.figure:not([data-src-url])').length,
          noFn: [...sec.querySelectorAll('[data-src-url]')].filter((e) => !(e.nextElementSibling && e.nextElementSibling.classList.contains('fn'))).length,
          scroll: document.documentElement.scrollWidth - window.innerWidth,
        };
      }, { pts: overlaps('#s3-timeline .tl-pt') });
      if (d.defs.join('|') !== 'Forecast gap|Structural deficit|Balanced budget') fail(`definitions: ${d.defs}`);
      if (d.points !== 8) fail(`${d.points} timeline points`);
      if (d.ptOverlap.length) fail(`timeline labels overlap: ${JSON.stringify(d.ptOverlap)}`);
      if (d.ptOut) fail(`${d.ptOut} timeline label(s) past the right edge`);
      if (!d.funnelW || Math.abs(d.funnelW - d.funnelBox) > 2) fail(`funnel drawn at ${d.funnelW}px in a ${d.funnelBox}px box after opening`);
      if (d.unsourced) fail(`${d.unsourced} .figure without data-src-url`);
      if (d.noFn) fail(`${d.noFn} sourced element(s) without a footnote button`);
      if (d.scroll > 0) fail(`horizontal scroll (${d.scroll}px)`);
      // A dot opens its details on click and on keyboard focus; Escape closes them.
      const dot = page.locator('#s3-timeline .tl-dot').nth(2);
      await dot.click();
      const tip = await page.evaluate(() => {
        const t = document.querySelector('#s3-timeline .tl-tip:not([hidden])');
        return t ? { text: t.textContent, expanded: document.querySelectorAll('#s3-timeline .tl-dot[aria-expanded="true"]').length } : null;
      });
      if (!tip || !/Who.*Document.*Describes.*What it counts/.test(tip.text) || tip.expanded !== 1) fail(`dot click details: ${JSON.stringify(tip)}`);
      await page.keyboard.press('Escape');
      if (await page.locator('#s3-timeline .tl-tip:not([hidden])').count()) fail('Escape did not close the details');
      await page.locator('#s3-timeline .tl-dot').nth(0).focus();
      await page.keyboard.press('Tab'); // keyboard focus (focus-visible) on the next stop
      const kb = await page.evaluate(() => {
        const a = document.activeElement;
        const t = a?.closest('.tl-pt')?.querySelector('.tl-tip');
        return { onDot: !!a?.classList.contains('tl-dot'), shown: t ? !t.hidden : false, fn: !!a?.classList.contains('fn') };
      });
      if (!kb.fn && !(kb.onDot && kb.shown)) fail(`keyboard focus did not show details: ${JSON.stringify(kb)}`);
      await page.keyboard.press('Escape');

      if (shot) {
        await page.evaluate(() => document.activeElement?.blur());
        const box = await page.evaluate(() => {
          const el = document.getElementById('gap').getBoundingClientRect();
          return { x: el.left + window.scrollX, y: el.top + window.scrollY, width: el.width, height: el.height };
        });
        await page.setViewportSize({ width, height: Math.ceil(box.y + box.height) });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(150);
        const box2 = await page.evaluate(() => {
          const el = document.getElementById('gap').getBoundingClientRect();
          return { x: el.left + window.scrollX, y: el.top + window.scrollY, width: el.width, height: el.height };
        });
        await page.screenshot({ path: path.join(SHOTS, `${shot}.png`), clip: box2 });
      }
      if (errors.length) fail(errors.join('; '));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return failures;
}

// Section 4: reserves meter, asset bars, PCI line, pension bars, payer bar, and the three dig deepers.
// Checks at 375 and 1200; screenshots of the whole section, every dig deeper open, at 375 light and dark.
async function section4(chromium) {
  const failures = [];
  const browser = await chromium.launch();
  try {
    for (const [width, scheme, shot] of [[375, 'light', 'v2-s4-375'], [375, 'dark', 'v2-s4-375-dark'], [1200, 'light', null]]) {
      const label = `s4 ${width}px ${scheme}`;
      const fail = (m) => failures.push(`${label}: ${m}`);
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await page.goto(`${BASE}/site/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#s4-roads svg.pci', { timeout: 10000 }).catch(() => {});
      await page.evaluate(() => document.querySelectorAll('#piles details.dig').forEach((d) => { d.open = true; }));
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const sec = document.getElementById('piles');
        const inside = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.left >= b.left - 0.5 && a.right <= b.right + 0.5; };
        const part = (id) => {
          const p = document.getElementById(id);
          const lead = p.querySelector(':scope > .lead');
          return {
            h3: p.querySelector(':scope > h3')?.textContent || '',
            leadFig: lead?.querySelector('.figure')?.textContent,
            lead: lead?.textContent || '',
            digFigs: p.querySelectorAll('details.dig .figure').length,
            digText: p.querySelector('details.dig .dig-body')?.textContent.trim().length || 0,
          };
        };
        const track = sec.querySelector('#s4-reserve .meter-track');
        const ticks = [...sec.querySelectorAll('#s4-reserve .meter-tick')].map((t) => t.getBoundingClientRect().left);
        const bal = sec.querySelector('#s4-reserve .meter-seg.is-balance')?.getBoundingClientRect();
        const rows = [...sec.querySelectorAll('#s4-assets .asset-bars li')];
        const has651 = [...sec.querySelectorAll('p, li, figcaption')].filter((e) => !e.querySelector('p, li') && /6\.51B/.test(e.textContent));
        const payerIn = sec.querySelector('#s4-payers .payer-in');
        return {
          placeholder: sec.querySelectorAll('[data-lead="placeholder"], [data-pile-fig]').length,
          sectionLead: sec.querySelector(':scope > .lead')?.textContent || '',
          parts: [part('reserves'), part('infrastructure'), part('pension')],
          segs: sec.querySelectorAll('#s4-reserve .meter-seg').length,
          ticks,
          balRight: bal ? bal.right : 0,
          trackOk: !!track && track.getAttribute('role') === 'img' && /unaudited/.test(track.getAttribute('aria-label')),
          keyRows: [...sec.querySelectorAll('#s4-reserve .pile-key li')].map((li) => [li.querySelector('.pk-name').textContent, li.querySelector('.pk-val').textContent.replace(/¹/g, '')]),
          labelsOut: [...sec.querySelectorAll('#s4-reserve .meter-label')].filter((l) => !inside(l, track)).map((l) => l.textContent),
          rows: rows.map((li) => [li.querySelector('.ab-name').textContent, li.querySelector('.ab-bar').getBoundingClientRect().width, li.classList.contains('is-rest')]),
          water: /Water and sewer projects/.test(sec.querySelector('#infrastructure').textContent),
          has651: has651.map((e) => e.textContent),
          growthOurs: /about \$1\.3B.*our arithmetic/.test(sec.querySelector('#s4-growth')?.textContent || ''),
          pciPts: sec.querySelectorAll('#s4-roads .pci-pt').length,
          pciDashed: sec.querySelectorAll('#s4-roads .pci-line.is-proj').length,
          pciOut: (() => { const svg = sec.querySelector('#s4-roads svg.pci'); if (!svg) return -1; const b = svg.getBoundingClientRect();
            return [...svg.querySelectorAll('text')].filter((t) => { const a = t.getBoundingClientRect(); return a.left < b.left - 1 || a.right > b.right + 1; }).length; })(),
          pbRows: sec.querySelectorAll('#s4-pension .pb-row').length,
          gapSeg: !!sec.querySelector('#s4-pension .pb-seg.is-gap'),
          gapLabel: sec.querySelector('#s4-pension .pb-gap')?.textContent || '',
          payerSegs: sec.querySelectorAll('#s4-payers .payer-seg').length,
          payerIn: payerIn?.textContent,
          payerInFits: payerIn ? inside(payerIn, payerIn.parentElement) : false,
          payerCap: sec.querySelector('#s4-payers .chart-cap')?.textContent || '',
          pensionCopy: sec.querySelector('#s4-pension-copy')?.textContent || '',
          examples: sec.querySelectorAll('#s4-infra-dig .pile-list li').length,
          steps: sec.querySelectorAll('#s4-infra-dig .pile-steps li').length,
          links: [...sec.querySelectorAll('#s4-infra-dig a:not(.gl)')].map((a) => a.getAttribute('href')),
          ours: [...sec.querySelectorAll('.figure')].filter((f) => f.dataset.srcDoc.startsWith('our arithmetic'))
            .filter((f) => !/our arithmetic/.test(f.closest('li, p, figcaption')?.textContent || '')).map((f) => f.textContent),
          unsourced: sec.querySelectorAll('.figure:not([data-src-url])').length,
          noFn: [...sec.querySelectorAll('[data-src-url]')].filter((e) => !(e.nextElementSibling && e.nextElementSibling.classList.contains('fn'))).length,
          scroll: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      if (r.placeholder) fail(`${r.placeholder} placeholder(s) left in #piles`);
      if (!/pile up/.test(r.sectionLead)) fail(`section lead: "${r.sectionLead}"`);
      const want = [['rainy-day', '$202.4M'], ['Roads', '$7.82B'], ['pension', '76 cents']];
      r.parts.forEach((pt, i) => {
        if (!pt.h3.toLowerCase().includes(want[i][0].toLowerCase())) fail(`part ${i} heading "${pt.h3}"`);
        if (pt.leadFig !== want[i][1]) fail(`part ${i} lead's first figure is "${pt.leadFig}", expected ${want[i][1]}`);
        if (!pt.digText) fail(`part ${i} dig deeper is empty`);
      });
      if (!/not yet audited/.test(r.parts[0].lead)) fail('reserve lead does not say unaudited');
      if (!/IBA/.test(r.parts[0].lead)) fail('reserve lead does not say whose target it is');
      if (r.segs !== 3 || r.ticks.length !== 2) fail(`meter: ${r.segs} segments, ${r.ticks.length} ticks`);
      if (!(r.balRight < r.ticks[0] && r.ticks[0] < r.ticks[1])) fail(`meter order: balance ${r.balRight}, ticks ${r.ticks}`);
      if (!r.trackOk) fail('meter has no image role/label naming it unaudited');
      // The pale stretch is the amount still to save; it carries no number (the target's values sit on the target row).
      const gapRow = r.keyRows.find((k) => /Still to save/.test(k[0]));
      const targetRow = r.keyRows.find((k) => /^FY2026 target$/.test(k[0]));
      if (!gapRow || gapRow[1].trim() !== '') fail(`meter key: still-to-save row ${JSON.stringify(gapRow)}`);
      if (!targetRow || !/14\.1%.*\$262\.9M/.test(targetRow[1])) fail(`meter key: target row ${JSON.stringify(targetRow)}`);
      if (r.keyRows.some((k) => /short/i.test(k[0]) && /\$/.test(k[1]))) fail('meter key: a "short" row shows a dollar amount');
      if (r.labelsOut.length) fail(`meter labels outside the track: ${r.labelsOut}`);
      if (r.rows.length !== 9 || r.rows[0][0] !== 'Stormwater' || r.rows[8][0] !== 'Everything else' || !r.rows[8][2]) fail(`asset rows: ${JSON.stringify(r.rows.map((x) => x[0]))}`);
      if (r.rows.slice(0, 8).some((x, i) => i && x[1] > r.rows[i - 1][1] + 0.5)) fail('asset bars are not sorted by width');
      if (!r.water) fail('no sentence on water and sewer counting as fully funded');
      if (r.has651.length !== 1 || !/our arithmetic/.test(r.has651[0])) fail(`"6.51B" outside the our-arithmetic sentence: ${JSON.stringify(r.has651)}`);
      if (!r.growthOurs) fail('growth sentence is not "about $1.3B ... our arithmetic"');
      if (r.pciPts !== 4 || r.pciDashed !== 1) fail(`PCI line: ${r.pciPts} points, ${r.pciDashed} dashed segment(s)`);
      if (r.pciOut) fail(`${r.pciOut} PCI label(s) outside the chart`);
      if (r.pbRows !== 2 || !r.gapSeg || !/\$3\.46B.*short/.test(r.gapLabel)) fail(`pension bars: ${r.pbRows} rows, gap ${r.gapSeg}, "${r.gapLabel}"`);
      if (r.payerSegs !== 5 || r.payerIn !== '70%' || !r.payerInFits) fail(`payer bar: ${r.payerSegs} segments, GF label "${r.payerIn}" fits ${r.payerInFits}`);
      if (!/budget assigns/.test(r.payerCap)) fail('payer caption does not say "the budget assigns"');
      if (!/\$573\.2M.*\$493\.4M/.test(r.pensionCopy) || !/2041/.test(r.pensionCopy) || !/\$26\.4M/.test(r.pensionCopy)) fail(`pension copy: "${r.pensionCopy}"`);
      if (r.examples !== 5 || r.steps !== 4) fail(`infrastructure dig: ${r.examples} examples, ${r.steps} steps`);
      if (r.links.join() !== '#what,#claim-tab-bike-lanes') fail(`infrastructure dig links: ${r.links}`);
      if (r.ours.length) fail(`our-arithmetic figures without the words on screen: ${r.ours.join(', ')}`);
      if (r.unsourced) fail(`${r.unsourced} .figure without data-src-url`);
      if (r.noFn) fail(`${r.noFn} sourced element(s) without a footnote button`);
      if (r.scroll > 0) fail(`horizontal scroll (${r.scroll}px)`);
      // The "Construction projects pot" link opens that pot in section 1.
      await page.locator('#s4-infra-dig a[href="#what"]').click();
      await page.waitForTimeout(100);
      const pot = await page.evaluate(() => document.querySelector('#s1-pots .pot[aria-pressed="true"]')?.dataset.pot);
      if (pot !== 'cip') fail(`Construction projects link selected pot "${pot}"`);

      if (shot) {
        await page.goto(`${BASE}/site/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#s4-roads svg.pci', { timeout: 10000 }).catch(() => {});
        await page.evaluate(() => document.querySelectorAll('#piles details.dig').forEach((d) => { d.open = true; }));
        const clip = () => page.evaluate(() => {
          const el = document.getElementById('piles').getBoundingClientRect();
          return { x: el.left + window.scrollX, y: el.top + window.scrollY, width: el.width, height: el.height };
        });
        const box = await clip();
        await page.setViewportSize({ width, height: Math.ceil(box.y + box.height) });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(SHOTS, `${shot}.png`), clip: await clip() });
      }
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
    if (!smokeOnly) failures.push(...(await section1(chromium)), ...(await section2(chromium)), ...(await section3(chromium)), ...(await section4(chromium)));
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
