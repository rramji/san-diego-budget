// Task 12: bike card link, Sources titles, the methods note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { claimCardModel } from '../site/claims.js';
import { collectSources, docTitle, expandUrls } from '../site/sources.js';
import { methodsModel, RULES } from '../site/methods.js';

const dir = new URL('../data/build/', import.meta.url);
// As the site loads them: shared URL keys expanded (sources.js expandUrls).
const load = (f) => expandUrls(JSON.parse(readFileSync(new URL(`${f}.json`, dir), 'utf8')));
const all = Object.fromEntries(readdirSync(dir).map((f) => [f, expandUrls(JSON.parse(readFileSync(new URL(f, dir), 'utf8')))]));

test('bike card exposes its link to how projects are chosen; the others have none', () => {
  const claims = load('claims');
  for (const c of claims) {
    const m = claimCardModel(c);
    if (c.id === 'bike-lanes') assert.deepEqual(m.link, { href: '#infrastructure', text: 'How projects are chosen ↓' });
    else assert.equal(m.link, null);
  }
});

test('Sources: one entry per URL, each titled by the document, never by one cited part', () => {
  const list = collectSources(all, null);
  assert.equal(new Set(list.map((s) => s.url)).size, list.length);
  const by = Object.fromEntries(list.map((s) => [s.url, s.title]));
  const iba = (n) => list.find((s) => s.title.startsWith(`IBA Report ${n}`))?.title;
  assert.equal(iba('26-11'), 'IBA Report 26-11, Review of the FY 2027 Proposed Budget');
  assert.equal(iba('26-15'), "IBA Report 26-15, Recommended City Council Modifications to the Mayor's Proposed FY 2027 Budget and Review of the May Revision");
  assert.equal(iba('21-10'), 'IBA Report 21-10, Review of the FY 2022 Proposed Budget');
  for (const n of ['17-16', '18-08', '19-06', '25-36', '26-06']) assert.match(iba(n), /^IBA Report \d\d-\d\d, Review of /, n);
  for (const t of Object.values(by)) {
    assert.doesNotMatch(t, /Department Review|our arithmetic|derived:|, (Table|Figure) \d/, t);
    assert.equal((t.match(/\(/g) || []).length, (t.match(/\)/g) || []).length, `unbalanced parentheses: ${t}`);
    assert.doesNotMatch(t, /^https?:/, `untitled source: ${t}`);
  }
  // Section 1's tree sources are collected (they live in budget_tree.sources, a keyed map).
  assert.match(by['https://seshat.datasd.org/operating_budget/budget_operating_datasd.csv'], /^City of San Diego open data: operating budget CSV/);
  assert.match(by['https://data.sandiego.gov/datasets/cip-fy-budget/'], /^City of San Diego open data: Capital Improvement Program/);
  assert.equal(by['https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1generalfundrevenues.pdf'], 'FY2027 Adopted Budget Vol. I, General Fund Revenues');
  // Every source in the four v2 files reaches the list.
  for (const f of ['budget_tree.json', 'why_short.json', 'gap_story.json', 'piles_up.json']) {
    const urls = new Set();
    const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.url === 'string' && typeof v.doc === 'string') urls.add(v.url); Object.values(v).forEach(walk); } };
    walk(all[f]);
    for (const u of urls) assert.ok(by[u], `${f}: ${u} missing from Sources`);
  }
});

test('docTitle ignores our-arithmetic descriptions when naming a document', () => {
  const t = docTitle(['IBA Report 9-1, Review of X: a', 'IBA Report 9-1, Review of X: b', 'our arithmetic: 1 + 2 = 3, from IBA Report 9-1'], 'https://x.org/9-1.pdf');
  assert.equal(t, 'IBA Report 9-1, Review of X');
});

test('methods note: years, category rule, size rule, unassigned and unmatched from the built tree', () => {
  const tree = load('budget_tree');
  const m = methodsModel(tree);
  const text = m.paras.map((p) => p.map((x) => (typeof x === 'string' ? x : x.text)).join('')).join('\n');
  assert.match(text, new RegExp(`FY${tree.bar_fy}`));
  assert.match(text, new RegExp(`FY${tree.detail_fy}`));
  assert.match(text, new RegExp(`${RULES.categories} plain categories`));
  assert.match(text, /Small items in a map are grouped into an "Everything else" box/);
  assert.match(text, /\$15M/);
  assert.match(text, /\$50M/);
  assert.match(text, /\$50,000/);
  assert.match(text, /Internal services & other/);
  assert.match(text, /Not assigned to a fund in the city's data/);
  assert.match(text, new RegExp(`${tree.unmatched.rows} rows`));
  assert.match(text, /our arithmetic/);
  const figs = m.paras.flat().filter((x) => typeof x !== 'string');
  const amounts = figs.map((f) => f.text);
  assert.ok(amounts.includes('$82.4M') && amounts.includes('$83.1M'), amounts.join());
  for (const f of figs) {
    assert.match(f.source.url, /^https:\/\//);
    if (f.source.doc.startsWith('our arithmetic')) assert.ok(f.ours);
  }
});
