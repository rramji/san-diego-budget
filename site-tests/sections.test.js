import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare as cents } from '../site/charts/cents-bar.js';
import { rateBars, countyBars } from '../site/why.js';
import { prepare as waterfall } from '../site/charts/waterfall.js';
import { prepare as timeline, layoutY, BREAK_MONTHS } from '../site/charts/gap-timeline.js';
import { noteParts, stepLabel, citeParts } from '../site/gapstory.js';
import { markerParts } from '../site/charts/deficit-bars.js';
import { moneyToken } from '../site/format.js';
import { isOurs, expandUrls } from '../site/sources.js';
import { compute } from '../site/gapcalc.js';
import { prepareReserve, prepareAssets, preparePension, preparePci, EVERYTHING_ELSE } from '../site/charts/piles.js';

const load = (f) => expandUrls(JSON.parse(readFileSync(new URL(`../data/build/${f}.json`, import.meta.url), 'utf8')));
const why = load('why_short');
const story = load('gap_story');
const gap = load('gap');
const sd = load('structural_deficit');
const piles = load('piles_up');

test('cents bar segments tile 0..100 and highlight cities', () => {
  const p = cents(why.property_dollar);
  const s = p.segments;
  assert.ok(s.length >= 2);
  assert.equal(s[0].x0, 0);
  assert.ok(Math.abs(s[s.length - 1].x1 - 100) <= 0.2);
  for (let i = 1; i < s.length; i += 1) assert.ok(Math.abs(s[i].x0 - s[i - 1].x1) < 1e-9, `gap before ${s[i].label}`);
  for (const g of s) assert.ok(Math.abs(g.x1 - g.x0 - g.cents) < 1e-9 && g.cents >= 0, g.label);
  const hi = s.filter((g) => g.highlight);
  assert.equal(hi.length, 1);
  assert.match(hi[0].label, /cit/i);
  assert.ok(Math.abs(p.total - 100) <= 0.2);
});

test('cents bar: the cities segment is 17.8 and says it is our arithmetic, with its printed parts', () => {
  const p = cents(why.property_dollar);
  const c = p.segments.find((g) => g.highlight);
  assert.ok(Math.abs(c.cents - 17.8) < 1e-9);
  assert.ok(c.figure.source.doc.startsWith('our arithmetic: '));
  assert.match(c.figure.source.doc, /12\.4.*5\.4.*17\.8/);
  assert.deepEqual(c.parts.map((x) => x.cents.value).sort(), [12.4, 5.4]);
  // A segment made of one printed slice keeps that slice's own figure.
  const schools = p.segments.find((g) => /school/i.test(g.label));
  assert.equal(schools.figure.value, 44.7);
  assert.ok(!schools.figure.source.doc.startsWith('our arithmetic'));
});

test('cents bar: pure, deterministic, and groups only adjacent slices', () => {
  const pd = {
    slices: [
      { label: 'A', group: 'G', cents: { value: 10, source: { doc: 'd', page: 1, url: 'https://x' } } },
      { label: 'B', cents: { value: 60, source: { doc: 'd', page: 1, url: 'https://x' } } },
      { label: 'C', group: 'G', cents: { value: 30, source: { doc: 'd', page: 1, url: 'https://x' } } },
    ],
    cities_cents: { value: 40, source: { doc: 'd', page: 1, url: 'https://x' } },
  };
  const before = JSON.stringify(pd);
  const p = cents(pd);
  assert.equal(JSON.stringify(pd), before);
  assert.deepEqual(p.segments.map((g) => g.label), ['G', 'B', 'G']);
  assert.deepEqual(cents(pd), p);
});

test('rate bars: sorted high to low, San Diego highlighted, widths relative to the largest', () => {
  const rows = rateBars(why.sales_tax.peers);
  assert.equal(rows.length, 6);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].rate >= rows[i].rate);
  assert.equal(rows[0].city, 'Oakland');
  assert.equal(rows[0].pct, 100);
  const sd = rows.filter((r) => r.highlight);
  assert.equal(sd.length, 1);
  assert.equal(sd[0].city, 'San Diego');
  assert.ok(Math.abs(sd[0].pct - (7.75 / 10.75) * 100) < 1e-9);
});

test('waterfall runs 118 → 146.2 → 120 → 0 and flags our arithmetic', () => {
  const p = waterfall(story.waterfall);
  assert.equal(p.bars.length, 9);
  assert.equal(p.bars[0].y0, 0);
  assert.equal(p.bars[0].y1, 118);
  assert.deepEqual(p.bars.filter((b) => b.kind === 'subtotal').map((b) => b.y1), [146.2, 120.0]);
  for (const b of p.bars.filter((x) => x.kind === 'subtotal' || x.kind === 'start')) assert.equal(b.y0, 0);
  const last = p.bars[p.bars.length - 1];
  assert.equal(last.kind, 'end');
  assert.ok(Math.abs(last.y1) <= 0.05);
  const ours = p.bars.filter((b) => b.ourArithmetic);
  assert.equal(ours.length, 1);
  assert.match(ours[0].figure.source.doc, /^our arithmetic: /);
  // each down step starts where the running total stood and ends lower by its amount
  for (const b of p.bars.filter((x) => x.kind === 'down')) assert.ok(Math.abs(b.y0 - b.y1 - b.figure.value) < 1e-9, b.label);
  assert.equal(p.max, 146.2);
  assert.equal(p.bars[5].positions.value, 236.76);
  assert.equal(p.bars[0].positions, null);
});

test('waterfall prepare throws when steps do not close', () => {
  const steps = structuredClone(story.waterfall);
  steps[6].amount_m.value += 1;
  assert.throws(() => waterfall(steps), /close|0/);
  const bad = structuredClone(story.waterfall);
  bad[2].amount_m.value = 140;
  assert.throws(() => waterfall(bad), /subtotal/);
  const kind = structuredClone(story.waterfall);
  kind[1].kind = 'sideways';
  assert.throws(() => waterfall(kind), /kind/);
});

test('waterfall prepare is pure', () => {
  const before = JSON.stringify(story.waterfall);
  assert.deepEqual(waterfall(story.waterfall), waterfall(story.waterfall));
  assert.equal(JSON.stringify(story.waterfall), before);
});

test('waterfall step labels never say "our arithmetic" on the page; the footnote does', () => {
  const p = waterfall(story.waterfall);
  const labels = p.bars.map(stepLabel);
  assert.equal(labels.filter((l) => /our arithmetic/.test(l)).length, 0);
  assert.match(p.bars.find((b) => b.ourArithmetic).figure.source.doc, /^our arithmetic: /);
});

test('timeline sorts by date and separates near points into lanes', () => {
  const shuffled = [...story.timeline].reverse();
  const p = timeline(shuffled);
  assert.equal(p.points.length, story.timeline.length);
  for (let i = 1; i < p.points.length; i += 1) assert.ok(p.points[i - 1].t <= p.points[i].t);
  const at = (v) => p.points.find((x) => x.value_m === v);
  assert.equal(at(118.0).date, '2026-04');
  assert.equal(at(11.2).date, '2026-04');
  assert.notEqual(at(118.0).lane, at(11.2).lane);
  assert.notEqual(at(15.3).lane, at(32.9).lane);
  assert.notEqual(at(23.1).lane, at(9.5).lane);
  // points more than 45 days from their neighbour go back to lane 0
  assert.equal(at(258.2).lane, 0);
  assert.equal(at(88.8).lane, 0);
  for (const x of p.points) assert.ok(x.lane === 0 || x.lane === 1);
  assert.deepEqual(p.years, [2024, 2026]);
  assert.equal(at(11.2).figure2.value, 91.3);
  assert.equal(at(258.2).figure2, null);
  assert.equal(at(258.2).figure.value, 258.2);
});

test('timeline lanes: synthetic close and far points', () => {
  const f = (value) => ({ value, source: { doc: 'd', page: 1, url: 'https://x' } });
  const e = (date, v) => ({ date, office: 'IBA', doc_label: 'd', describes_fy: 2027, counts: 'c', value_m: f(v), value2_m: null });
  const p = timeline([e('2026-03', 3), e('2026-01', 1), e('2026-02', 2), e('2026-09', 9)]);
  assert.deepEqual(p.points.map((x) => x.value_m), [1, 2, 3, 9]);
  assert.deepEqual(p.points.map((x) => x.lane), [0, 1, 0, 0]);
  assert.throws(() => timeline([e('2026-13', 1)]), /date/);
});

test('what\'s coming note: the city figure and the forecast date are sourced parts', () => {
  const c = story.headlines.coming;
  const parts = noteParts(c);
  assert.equal(parts.map((x) => (typeof x === 'string' ? x : x.text)).join(''), c.note);
  const fig = parts.find((x) => x.kind === 'figure');
  assert.equal(fig.text, '$9.5M');
  assert.equal(fig.figure, c.city_m);
  const cite = parts.find((x) => x.kind === 'cite');
  assert.match(cite.text, /November 6, 2026/);
  assert.equal(cite.source, c.forecast_due.source);
});

test('what\'s coming note: a whole-number city figure is found as "$12M"; a missing token or cite anchor throws', () => {
  const c = structuredClone(story.headlines.coming);
  c.city_m.value = 12.0;
  c.note = c.note.replace('$9.5M', '$12M');
  assert.equal(noteParts(c).find((x) => x.kind === 'figure').text, '$12M');
  assert.throws(() => noteParts({ ...c, note: c.note.replace('$12M', '$12.0M') }), /\$12M/);
  assert.throws(() => noteParts({ ...c, note: c.note.replace('A new forecast is due', 'Next forecast:') }), /A new forecast is due/);
});

test('deficit chart: the FY2028 marker shows both figures; a missing amount throws', () => {
  const m = sd.markers.find((x) => x.fy === story.headlines.coming.fy);
  assert.deepEqual(m.figures, [story.headlines.coming.city_m, story.headlines.coming.iba_m]);
  const parts = markerParts(m.label, m.figures);
  assert.deepEqual(parts.filter((x) => typeof x !== 'string').map((x) => x.token), ['$9.5M', '$32.9M']);
  assert.equal(parts.map((x) => (typeof x === 'string' ? x : x.token)).join(''), m.label);
  const twelve = { value: 12.0, source: m.figures[0].source };
  assert.deepEqual(markerParts('city $12M, IBA $32.9M', [twelve, m.figures[1]]).filter((x) => typeof x !== 'string').map((x) => x.token), ['$12M', '$32.9M']);
  assert.throws(() => markerParts('city $12.0M', [twelve]), /\$12M/);
});

test('moneyToken writes amounts as the Python build does', () => {
  assert.deepEqual([9.5, 32.9, 12.0, 12, 0.25].map(moneyToken), ['$9.5M', '$32.9M', '$12M', '$12M', '$0.25M']);
});

test('isOurs: one prefix, "our arithmetic: "; "derived:" is not accepted and appears nowhere in the built data', () => {
  assert.equal(isOurs({ doc: 'our arithmetic: 1 + 2 = 3' }), true);
  assert.equal(isOurs({ doc: 'derived: 1 + 2' }), false);
  assert.equal(isOurs({ doc: 'IBA Report 26-11' }), false);
  assert.equal(isOurs(null), false);
  for (const f of ['funnel', 'structural_deficit', 'flows', 'budget_tree', 'gap', 'gap_story', 'piles_up', 'why_short', 'claims', 'cuts']) {
    assert.doesNotMatch(readFileSync(new URL(`../data/build/${f}.json`, import.meta.url), 'utf8'), /"derived:/, f);
  }
  const fn = load('funnel');
  assert.ok(isOurs(fn.bar3.debt_service_m.source) && /adopted and proposed/.test(fn.bar3.debt_service_m.source.doc));
  assert.ok(isOurs(fn.bar3.everything_else_m.source));
  assert.ok(isOurs(fn.bar4.find((d) => d.dept === 'All other').amount_m.source));
});

test('calculator second state is our arithmetic about $103M', () => {
  const [city, ours] = compute(gap, 'post_cut').figures;
  assert.equal(city.amount_m, story.residual.ongoing_m.value);
  assert.equal(ours.framing, 'Our arithmetic');
  assert.equal(ours.approx, true);
  assert.equal(Math.round(ours.amount_m), 103);
  assert.equal(ours.amount_m, story.residual.with_reserve_m.value);
  assert.match(gap.post_cut_with_reserve_m.source.doc, /^our arithmetic: /);
});

test('timeline layout: proportional to time, long quiet stretches drawn shorter and marked', () => {
  const p = timeline(story.timeline);
  const { y, breaks } = layoutY(p.points, 10, 0);
  const ys = [...y.values()];
  for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i] > ys[i - 1]);
  assert.deepEqual(breaks.map((b) => b.months), [11]); // Dec 2024 to Nov 2025
  assert.ok(BREAK_MONTHS < 11 && BREAK_MONTHS >= 5);
  const at = (d) => y.get(p.points.find((x) => x.date === d).t);
  assert.equal(at('2026-04') - at('2025-11'), 50); // five months, drawn to scale
  assert.equal(at('2026-06') - at('2026-04'), 20);
});

test('assets: top 8 plus everything else, sums to gap', () => {
  const inf = piles.infrastructure;
  const rows = prepareAssets(inf.by_asset);
  assert.equal(rows.length, 9);
  const top = rows.slice(0, 8);
  for (let i = 1; i < top.length; i += 1) assert.ok(top[i - 1].value_m >= top[i].value_m, top[i].asset);
  assert.equal(rows[0].asset, 'Stormwater');
  assert.equal(rows[0].pct, 100);
  const rest = rows[8];
  assert.equal(rest.asset, EVERYTHING_ELSE);
  assert.equal(rest.rest, true);
  assert.equal(rest.count, inf.by_asset.length - 8);
  assert.match(rest.figure.source.doc, /^our arithmetic: /);
  assert.ok(Math.abs(rows.reduce((t, r) => t + r.value_m, 0) - inf.gap_m.value) <= 1);
  // the eight named rows keep their own printed figures
  for (const r of top) assert.ok(!r.figure.source.doc.startsWith('our arithmetic'), r.asset);
  // n is a parameter, and the input is not mutated
  const before = JSON.stringify(inf.by_asset);
  assert.equal(prepareAssets(inf.by_asset, 3).length, 4);
  assert.equal(JSON.stringify(inf.by_asset), before);
  // with n >= rows there is no remainder row
  assert.ok(!prepareAssets(inf.by_asset.slice(0, 5), 8).some((r) => r.rest));
});

test('pension: GF share is 70%', () => {
  const p = preparePension(piles.pension);
  assert.deepEqual(p.bars.map((b) => b.key), ['promised', 'held']);
  assert.equal(p.bars[0].pct, 100);
  assert.ok(Math.abs(p.bars[1].pct - (11048.857 / 14513.151) * 100) < 0.01);
  assert.equal(p.shortfall.figure, piles.pension.shortfall_m);
  assert.ok(Math.abs(p.shortfall.x0 - p.bars[1].pct) < 1e-9 && p.shortfall.x1 === 100);
  const gf = p.payers.find((x) => x.label === 'General Fund');
  assert.equal(Math.round(gf.share * 100), 70);
  assert.equal(p.payers[0], gf);
  assert.ok(Math.abs(p.payers.reduce((t, x) => t + x.share, 0) - 1) < 1e-9);
  for (let i = 1; i < p.payers.length; i += 1) assert.ok(Math.abs(p.payers[i].x0 - p.payers[i - 1].x1) < 1e-9);
  assert.ok(Math.abs(p.payers[p.payers.length - 1].x1 - 1) < 1e-9);
});

test('reserve fill below 1 and goal marked', () => {
  const r = prepareReserve(piles.reserves);
  assert.ok(r.fill > 0 && r.fill < 1);
  assert.ok(Math.abs(r.fill - 202.4 / 262.9) < 1e-9);
  assert.deepEqual(r.segments.map((s) => s.key), ['balance', 'short', 'beyond']);
  assert.equal(r.segments[0].x0, 0);
  assert.equal(r.segments[2].x1, 100);
  for (let i = 1; i < r.segments.length; i += 1) assert.equal(r.segments[i].x0, r.segments[i - 1].x1);
  assert.ok(Math.abs(r.segments[0].x1 - (10.9 / 16.7) * 100) < 1e-9);
  assert.deepEqual(r.marks.map((m) => m.key), ['target', 'goal']);
  const goal = r.marks.find((m) => m.key === 'goal');
  assert.equal(goal.x, 100);
  assert.equal(goal.figure, piles.reserves.goal_pct);
  assert.equal(goal.fy, 2030);
});

test('pci line: measured years solid, projection dashed, goal a reference', () => {
  const p = preparePci(piles.infrastructure.roads);
  assert.deepEqual(p.measured.map((x) => [x.year, x.value]), [[2016, 71], [2023, 63]]);
  assert.deepEqual(p.projected.map((x) => [x.year, x.value]), [[2027, 63], [2036, 52]]);
  assert.equal(p.goal.value, 65);
  assert.equal(p.goal.was, 70);
  assert.ok(p.domain[0] <= 52 && p.domain[1] >= 71);
});

test('piles_up stores repeated URLs once; expandUrls gives every Source its https URL back', () => {
  const raw = JSON.parse(readFileSync(new URL('../data/build/piles_up.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(raw.urls).length > 0);
  const outlook = 'https://www.sandiego.gov/sites/default/files/2026-02/fy-27-31-five-year-capital-infrastructure-planning-outlook.pdf';
  assert.equal(JSON.stringify(raw).split(outlook).length - 1, 1, 'the Outlook URL is stored once');
  const urls = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.doc === 'string') urls.push(v.url); Object.values(v).forEach(walk); } };
  walk(piles);
  assert.ok(urls.length > 40 && urls.every((u) => /^https:\/\//.test(u)));
  assert.equal(piles.urls, undefined);
  assert.equal(piles.infrastructure.by_asset[0].gap_m.source.url, outlook);
  assert.equal(expandUrls({ a: 1 }).a, 1); // a file without a table passes through
});

test('this year\'s $118M card cites both offices that reported it', () => {
  const ty = story.headlines.this_year;
  const parts = citeParts(ty.counting, ty.cites);
  assert.equal(parts.map((x) => (typeof x === 'string' ? x : x.text)).join(''), ty.counting);
  const cites = parts.filter((x) => typeof x !== 'string');
  assert.deepEqual(cites.map((x) => x.text), ['the IBA', 'the Mayor']);
  assert.match(cites[1].source.url, /mayors-message-fy2027-adopted-budget\.pdf$/);
  assert.throws(() => citeParts('nobody said so', ty.cites), /not found/);
});

test('sankey puts General Fund nodes first in every column', async () => {
  const { prepare } = await import('../site/charts/sankey.js');
  const flows = JSON.parse(readFileSync(new URL('../data/build/flows.json', import.meta.url), 'utf8'));
  const p = prepare(flows);
  for (const col of [0, 1, 2]) {
    const kinds = p.nodes.filter((n) => n.column === col).map((n) => n.kind);
    assert.equal(kinds[0], 'discretionary');
    assert.equal(kinds.lastIndexOf('discretionary') + 1, kinds.filter((k) => k === 'discretionary').length);
  }
});

test('sankey label helpers: whole-word wrap and non-overlapping spread', async () => {
  const { wrapMeasured, spreadLabels } = await import('../site/charts/sankey.js');
  assert.deepEqual(wrapMeasured('Permits, trash, golf, airports', 15, (s) => s.length), ['Permits, trash,', 'golf, airports']);
  const mids = spreadLabels([{ mid: 10, h: 10 }, { mid: 12, h: 10 }, { mid: 14, h: 10 }], 0, 100);
  assert.ok(mids[1] - mids[0] >= 10 && mids[2] - mids[1] >= 10);
  const packed = spreadLabels([{ mid: 95, h: 10 }, { mid: 98, h: 10 }], 0, 100);
  assert.ok(packed[1] + 5 <= 100 && packed[1] - packed[0] >= 10);
});

test('countyBars sorts the 18 cities by total and splits base from add-on', () => {
  const why = JSON.parse(readFileSync(new URL('../data/build/why_short.json', import.meta.url), 'utf8'));
  const rows = countyBars(why.sales_tax.county);
  assert.equal(rows.length, 18);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].total >= rows[i].total);
  const sd = rows.find((r) => r.city === 'San Diego');
  assert.ok(sd.highlight && sd.addon === 0 && sd.addonFigure === null);
  const lm = rows.find((r) => r.city === 'La Mesa');
  assert.equal(lm.addon, 0.75);
  assert.ok(Math.abs(lm.basePct + lm.addonPct - (8.5 / 8.75) * 100) < 1e-9);
  assert.equal(rows.filter((r) => r.addon > 0).length, why.sales_tax.county.n_addon.value);
});

// ---- Section bar ----
import { currentSection } from '../site/nav.js';

test('section bar: the current chapter is the last one whose top is above the reading line', () => {
  const tops = [['what', 1000], ['why-short', 3000], ['gap', 5000]];
  assert.equal(currentSection(tops, 0), null);
  assert.equal(currentSection(tops, 1000), 'what');
  assert.equal(currentSection(tops, 2999), 'what');
  assert.equal(currentSection(tops, 3000), 'why-short');
  assert.equal(currentSection(tops, 99999), 'gap');
});
