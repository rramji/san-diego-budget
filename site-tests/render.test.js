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

test('reserve is subtracted from resources only when resources_include_reserve is true', () => {
  const fig = (v) => ({ value: v, source: { doc: 'd', page: 1, url: 'https://example.org/x' } });
  const mk = (fy, flag) => ({
    fy, reported: true, structural_deficit_m: fig(50), one_time_resources_m: fig(100), one_time_expenditures_m: fig(20),
    suspended_reserve_m: fig(30), includes_suspended_reserve: false, resources_include_reserve: flag, components: null,
    basis: 'adopted budget; net of one-time expenditures', note: 'x. y.', gf_expenditure_adopted_m: 1000,
  });
  const p = prepare([mk(2030, true), mk(2031, false)]);
  const [yes, no] = p.bars.map((b) => b.stack.up);
  assert.deepEqual(yes.map((c) => c.amount_m), [70, 30]);
  assert.deepEqual(no.map((c) => c.amount_m), [100, 30]);
  assert.equal(p.bars[0].share, 0.05);
});

test('prepare computes peak share of General Fund spending; null where spending is unknown', () => {
  const p = prepare(data);
  assert.ok(Math.abs(p.stats.peak_share - 181.4 / 2160.943) < 1e-9);
  assert.equal(p.bars.find((b) => b.fy === 2027).share, null);
  assert.equal(p.bars.find((b) => b.fy === 2027).proposed_net, true);
  assert.equal(p.bars.find((b) => b.fy === 2026).proposed_net, false);
});

// ---- Chapter 2 funnel ----
import { prepare as funnelPrepare } from '../site/charts/funnel.js';

const fig = (value) => ({ value, source: { doc: 'test', page: 1, url: 'https://example.org/x' } });
const hl = { fy: 2027, total_budget_m: fig(6486.9), general_fund_m: fig(2256.7), enterprise_m: fig(1915.1), special_revenue_m: fig(1207.9), internal_service_m: fig(225.7), capital_project_m: fig(23.5), cip_m: fig(858.1) };
const fn = { fy: 2027, bar3: { pension_adc_m: fig(396.1), debt_service_m: fig(75), everything_else_m: fig(1700) }, bar4: [{ dept: 'Police', amount_m: fig(718.3) }, { dept: 'All other', amount_m: fig(1538.4) }], gap_m: fig(118) };

test('test_funnel_gap_ratio', () => {
  const p = funnelPrepare(hl, fn);
  assert.ok(Math.abs(p.gapRatio - 118 / 1700) < 1e-9);
  assert.ok(Math.abs(p.gapRatio - 0.0694) < 0.0001);
  assert.equal(p.bars[0].total_m, 6486.9);
  assert.deepEqual(p.bars.map((b) => b.id), ['total', 'locked', 'gf', 'depts']);
});

test('funnel bar 2 derives from bar 1: non-GF locked, GF unchanged', () => {
  const [b1, b2] = funnelPrepare(hl, fn).bars;
  assert.deepEqual(b2.segments.map((s) => s.amount_m), b1.segments.map((s) => s.amount_m));
  assert.equal(b2.segments[0].kind, 'general');
  assert.ok(b2.segments.slice(1).every((s) => s.kind === 'locked'));
  assert.ok(b1.segments.slice(1).every((s) => s.kind === 'restricted'));
});

test('funnel bar 3 and 4: contractual segments, gap is a separate segment outside the total', () => {
  const b = funnelPrepare(hl, fn).bars;
  assert.deepEqual(b[2].segments.map((s) => s.kind), ['locked', 'locked', 'discretionary']);
  assert.equal(b[2].segments[2].amount_m, 1700);
  const gap = b[3].segments.at(-1);
  assert.equal(gap.kind, 'gap');
  assert.equal(gap.amount_m, 118);
  assert.equal(b[3].total_m, 2256.7);
  const depts = b[3].segments.filter((s) => s.kind !== 'gap');
  assert.equal(depts.length, 2);
  assert.ok(depts.every((s) => s.figure && s.figure.source));
});

test('funnel on real data: segments sum to the General Fund and gap ratio is about 6.6%', () => {
  const rh = JSON.parse(readFileSync(new URL('../data/build/headline.json', import.meta.url), 'utf8'));
  const rf = JSON.parse(readFileSync(new URL('../data/build/funnel.json', import.meta.url), 'utf8'));
  const p = funnelPrepare(rh, rf);
  const sum = (b) => b.segments.filter((s) => s.kind !== 'gap').reduce((a, s) => a + s.amount_m, 0);
  assert.ok(Math.abs(sum(p.bars[3]) - 2256.7) < 0.05);
  assert.ok(Math.abs(sum(p.bars[2]) - 2256.7) < 0.05);
  assert.ok(Math.abs(p.gapRatio - 0.0661) < 0.0005);
});

// ---- Chapter 2 dig-deeper: sankey ----
import { prepare as sankeyPrepare } from '../site/charts/sankey.js';

test('test_sankey_prepare_preserves_highlight_and_rule', () => {
  const flows = JSON.parse(readFileSync(new URL('../data/build/flows.json', import.meta.url), 'utf8'));
  const p = sankeyPrepare(flows);
  assert.equal(p.nodes.length, 30);
  assert.equal(p.links.length, 27);
  assert.deepEqual(Object.keys(p.nodes[0]).sort(), ['column', 'id', 'kind', 'label']);
  const hl = p.links.filter((l) => l.highlight);
  assert.equal(hl.length, 1);
  assert.equal(hl[0].source, 'rule_restricted');
  assert.equal(hl[0].target, 'bike_ped');
  assert.equal(hl[0].value, 6.77);
  for (const [i, l] of p.links.entries()) {
    assert.equal(l.rule, flows.links[i].rule);
    assert.deepEqual(l.ref, flows.links[i].ref);
    assert.equal(l.value, flows.links[i].amount_m);
    assert.equal(typeof l.source, 'string');
  }
  const ids = new Set(p.nodes.map((n) => n.id));
  assert.ok(p.links.every((l) => ids.has(l.source) && ids.has(l.target)));
  // prepare must not mutate its input
  assert.equal(typeof flows.links[0].source, 'string');
  assert.equal(flows.links[0].amount_m, p.links[0].value);
});
