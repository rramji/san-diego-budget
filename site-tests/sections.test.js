import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare as cents } from '../site/charts/cents-bar.js';
import { rateBars } from '../site/why.js';

const why = JSON.parse(readFileSync(new URL('../data/build/why_short.json', import.meta.url), 'utf8'));

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
