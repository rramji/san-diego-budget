import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare } from '../site/charts/deficit-bars.js';

const data = JSON.parse(readFileSync(new URL('../data/build/structural_deficit.json', import.meta.url), 'utf8'));

test('test_prepare_excludes_unreported_from_stats', () => {
  const p = prepare(data);
  assert.equal(p.bars.length, 16);
  const unreported = p.bars.filter((b) => !b.reported);
  assert.deepEqual(unreported.map((b) => b.fy), [2015, 2016, 2017, 2021]);
  for (const b of unreported) assert.equal(b.value_m, null);
  const vals = data.years.filter((y) => y.reported).map((y) => y.structural_deficit_m.value);
  assert.equal(vals.length, 12);
  assert.ok(Math.abs(p.stats.mean_m - vals.reduce((a, b) => a + b, 0) / 12) < 1e-9);
  assert.equal(p.stats.max_m, 181.4);
  assert.equal(p.stats.peak_fy, 2025);
  assert.equal(p.stats.unreported, 4);
});

test('prepare keeps FY2013 reported zero distinct from unreported', () => {
  const b = prepare(data).bars.find((x) => x.fy === 2013);
  assert.equal(b.reported, true);
  assert.equal(b.value_m, 0);
});

test('prepare marks the two bases and the scale line has no zero-fill', () => {
  const p = prepare(data);
  assert.equal(p.bars.find((b) => b.fy === 2021).gross, true);
  assert.equal(p.bars.find((b) => b.fy === 2022).gross, false);
  assert.equal(p.bars.find((b) => b.fy === 2027).gross, false);
  assert.equal(p.scale.length, 15);
  assert.ok(!p.scale.some((s) => s.fy === 2027));
  assert.deepEqual(p.markers.map((m) => m.fy), [2011, 2025, 2026, 2028]);
});

test('prepare stacks: components when present, direct fields otherwise, no double count', () => {
  const p = prepare(data);
  const s12 = p.bars.find((b) => b.fy === 2012).stack;
  assert.equal(s12.up.length, 4);
  assert.ok(Math.abs(s12.up.reduce((a, c) => a + c.amount_m, 0) - 35.1) < 1e-9);
  const s25 = p.bars.find((b) => b.fy === 2025).stack;
  assert.ok(Math.abs(s25.up.reduce((a, c) => a + c.amount_m, 0) - 222.1) < 1e-9);
  assert.equal(s25.down.amount_m, 18.3);
  const s27 = p.bars.find((b) => b.fy === 2027).stack;
  assert.ok(Math.abs(s27.up.reduce((a, c) => a + c.amount_m, 0) - (24.8 + 80.1)) < 1e-9);
  assert.equal(p.bars.find((b) => b.fy === 2015).stack, null);
});
