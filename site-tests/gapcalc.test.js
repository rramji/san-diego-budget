import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compute } from '../site/gapcalc.js';

const fig = (value) => ({ value, source: { doc: `doc ${value}`, page: 1, url: `https://example.org/${value}` } });
const synthetic = {
  pre_cut_m: fig(118), post_cut_city_m: fig(23.1), post_cut_iba_m: fig(103.2), skipped_reserve_m: fig(80.1),
  fy2028_projection_m: fig(30), population: fig(1_400_000), households: fig(540_000),
  sales_tax_1pct_m: fig(386.7), cuttable_m: fig(1700),
};
const near = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('test_pre_cut_single_figure', () => {
  const { figures } = compute(synthetic, 'pre_cut');
  assert.equal(figures.length, 1);
  const f = figures[0];
  assert.equal(f.id, 'pre_cut');
  assert.equal(f.framing, 'Both');
  assert.equal(f.amount_m, 118);
  near(f.perPerson, 84.29, 0.01);
  near(f.perHousehold, 218.5, 0.05);
  near(f.centsPerDollar, 0.305, 0.001);
  near(f.monthlyFeePerHousehold, 18.2, 0.05);
  assert.equal(f.sources.population.url, 'https://example.org/1400000');
  assert.equal(f.sources.amount.url, 'https://example.org/118');
});

test('test_post_cut_two_framings_labeled', () => {
  const { figures } = compute(synthetic, 'post_cut');
  assert.deepEqual(figures.map((f) => f.framing), ['City budget office', 'Independent Budget Analyst']);
  assert.deepEqual(figures.map((f) => f.id), ['post_cut_city', 'post_cut_iba']);
  assert.deepEqual(figures.map((f) => f.amount_m), [23.1, 103.2]);
});

test('test_share_of_cuttable', () => {
  const f = compute(synthetic, 'pre_cut').figures[0];
  near(f.shareOfCuttable, 0.0694, 0.0001);
  assert.equal(f.oneDollarIn, 14);
});

test('test_unknown_mode_throws_and_real_gap_shape', () => {
  assert.throws(() => compute(synthetic, 'nope'));
  const real = JSON.parse(readFileSync(new URL('../data/build/gap.json', import.meta.url), 'utf8'));
  const f = compute(real, 'pre_cut').figures[0];
  assert.equal(f.oneDollarIn, 15);
});
