import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare as cents } from '../site/charts/cents-bar.js';
import { rateBars } from '../site/why.js';
import { prepare as waterfall } from '../site/charts/waterfall.js';
import { prepare as timeline, layoutY, BREAK_MONTHS } from '../site/charts/gap-timeline.js';
import { noteParts, stepLabel } from '../site/gapstory.js';
import { compute } from '../site/gapcalc.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/build/${f}.json`, import.meta.url), 'utf8'));
const why = load('why_short');
const story = load('gap_story');
const gap = load('gap');

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

test('waterfall step labels say "our arithmetic" on the computed step only', () => {
  const p = waterfall(story.waterfall);
  const labels = p.bars.map(stepLabel);
  assert.equal(labels.filter((l) => /our arithmetic/.test(l)).length, 1);
  assert.match(stepLabel(p.bars.find((b) => b.ourArithmetic)), /\(our arithmetic\)$/);
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
