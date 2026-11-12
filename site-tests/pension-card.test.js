// The pensions card's pictures: prepare() resolves every token, sizes every bar, and throws on a broken visual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare, fmt, tokenParts, citeParts } from '../site/charts/pension-card.js';
import { expandUrls } from '../site/sources.js';

const claims = expandUrls(JSON.parse(readFileSync(new URL('../data/build/claims.json', import.meta.url), 'utf8')));
const visual = claims.find((c) => c.id === 'pensions').visual;
const text = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');

test('fmt: money in millions and billions, shares of pay, cents on the dollar', () => {
  assert.deepEqual([fmt('x_m', 375.3), fmt('x_bn', 3.46), fmt('x_pct', 14), fmt('x_cents', 76.1), fmt('year', 2041)], ['$375.3M', '$3.46B', '14.0%', '76 cents', '2041']);
});

test('tokens and cites become sourced parts; a missing figure or cite text throws', () => {
  const f = { value: 1.5, source: { doc: 'd', page: 1, url: 'https://x' } };
  const parts = tokenParts('pays {a_m} of it', { a_m: f });
  assert.deepEqual(parts, ['pays ', { key: 'a_m', figure: f, text: '$1.5M' }, ' of it']);
  assert.throws(() => tokenParts('pays {b_m}', { a_m: f }), /no figure for \{b_m\}/);
  assert.deepEqual(citeParts('a b c', [{ text: 'b', source: f.source }]), ['a ', { cite: true, text: 'b', source: f.source }, ' c']);
  assert.throws(() => citeParts('a b c', [{ text: 'z', source: f.source }]), /cite "z"/);
});

test('the four pictures: the payment parts fill the bar, the heading and copy carry the sourced figures', () => {
  const m = prepare(visual);
  assert.equal(text(m.payment.heading), "Where does this year's $563.2M pension payment go?");
  assert.ok(Math.abs(m.payment.parts.reduce((s, p) => s + p.width, 0) - 100) < 0.3);
  assert.deepEqual(m.payment.parts.map((p) => p.text), ['$375.3M', '$170.4M', '$16.1M', '$1.9M']);
  assert.ok(m.payment.parts[0].width > 60 && m.payment.parts[0].role === 'past');
  assert.match(text(m.payment.text), /General Fund pays \$396\.3M/);
  assert.match(m.payment.summary, /^Of the \$563\.2M payment: Paying down the past shortfall \$375\.3M/);
  // Who pays: the wider rate bar is the full track; employee and city halves split it.
  const [gen, safety] = m.whoPays.rates;
  assert.equal(safety.width, 100);
  assert.ok(gen.width < 100 && Math.abs(gen.employee.width + gen.city.width - 100) < 0.3);
  assert.deepEqual([gen.employee.text, gen.city.text, safety.employee.text, safety.city.text], ['14.0%', '14.0%', '18.6%', '18.3%']);
  assert.equal(m.whoPays.flows.find((f) => f.role === 'other').width, 100);
  assert.equal(m.whoPays.text.filter((p) => p.cite).length, 2);
  // The shortfall: columns as tall as the funded ratio, the episodes spanning their years, the net change the widest bar.
  assert.deepEqual(m.shortfall.history.map((h) => [h.year, h.height]), [[2001, 97.3], [2004, 65.8], [2007, 78.8], [2009, 66.5], [2025, 76.1]]);
  assert.deepEqual(m.shortfall.episodes.map((e) => [e.start, e.span]), [[1, 2], [3, 2], [5, 1]]);
  assert.equal(text(m.shortfall.episodes[2].parts), '$3.46B short today');
  assert.deepEqual(m.shortfall.changes.map((c) => c.text), ['+$1.82B', '+$1.49B', '−$1.15B']);
  assert.equal(m.shortfall.net.width, 100);
  assert.match(text(m.shortfall.text), /held 76 cents .* up from 75 cents/);
  // Reform: the old plan carries almost all of the shortfall; the timeline's sourced items and figure items.
  const ual = m.reform.rows.find((r) => r.key === 'ual_bn');
  assert.deepEqual(ual.cells.map((c) => [c.text, c.width]), [['$1.63B', 100], ['$0.24B', 14.7]]);
  assert.deepEqual(m.reform.timeline.map((t) => t.when), ['2012', '2021', '2022', 'FY2029', '2041']);
  assert.equal(text(m.reform.timeline[3].parts), 'The payment is projected to fall from $573.2M to $493.4M as older layers of the shortfall are paid off');
  assert.ok(m.reform.timeline[0].parts[0].cite);
});

test('a broken visual throws: wrong kind, an episode off the axis', () => {
  assert.throws(() => prepare({ ...visual, kind: 'bars' }), /kind/);
  const bad = structuredClone(visual);
  bad.shortfall.episodes[0].to = 2003;
  assert.throws(() => prepare(bad), /episode 2001–2003/);
});
