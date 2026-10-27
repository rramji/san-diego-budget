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

test('FY2028 marker carries the city and IBA figures', () => {
  const mk = prepare(data).markers.find((m) => m.fy === 2028);
  assert.deepEqual(mk.figures.map((f) => f.value), [9.5, 32.9]);
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
const fn = { fy: 2027, bar3: { pension_adc_m: fig(396.3), debt_service_m: fig(75), everything_else_m: fig(1700) }, bar4: [{ dept: 'Police', amount_m: fig(718.3) }, { dept: 'All other', amount_m: fig(1538.4) }], gap_m: fig(118) };

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
  assert.equal(p.nodes.length, 32);
  assert.equal(p.links.length, 30);
  assert.deepEqual(Object.keys(p.nodes[0]).sort(), ['column', 'id', 'kind', 'label']);
  const hl = p.links.filter((l) => l.highlight);
  assert.equal(hl.length, 1);
  assert.equal(hl[0].source, 'rule_capital');
  assert.equal(hl[0].target, 'bike_ped');
  assert.equal(hl[0].value, 6.5);
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

import { groupFlows } from '../site/charts/sankey.js';
test('groupFlows puts every link under exactly one rule node, highlighted flow first', () => {
  const flows = JSON.parse(readFileSync(new URL('../data/build/flows.json', import.meta.url), 'utf8'));
  const prep = sankeyPrepare(flows);
  const groups = groupFlows(prep);
  assert.equal(groups.length, 4);
  assert.equal(groups.reduce((a, g) => a + g.links.length, 0), 30);
  const g = groups.find((x) => x.rule.id === 'rule_capital');
  assert.equal(g.links[0].highlight, true);
  assert.equal(g.links[0].targetLabel, 'Bike & pedestrian projects');
  assert.ok(groups.every((x) => x.links.every((l) => l.rule && l.ref)));
});

// ---- Chapter 4 claim cards ----
import { claimCardModel } from '../site/claims.js';
import { prepare as claimChartPrepare } from '../site/charts/claim-chart.js';

test('test_claim_card_model_null_chart', () => {
  const claims = JSON.parse(readFileSync(new URL('../data/build/claims.json', import.meta.url), 'utf8'));
  assert.equal(claims.length, 5);
  for (const c of claims) {
    const m = claimCardModel(c);
    assert.equal(m.hasChart, c.chart !== null);
    assert.equal(m.caveatText, `What this doesn't tell you: ${c.caveat}`);
    assert.ok(m.chipLabel.split(' ').length <= 4);
    assert.equal(m.sources.length, c.sources.length);
  }
  const managers = claimCardModel(claims.find((c) => c.id === 'managers'));
  assert.equal(managers.hasChart, false);
  assert.equal(managers.chipLabel, 'Too many managers');
});

test('claim chart prepare keeps the zero series and does not zero-fill the line', () => {
  const claims = JSON.parse(readFileSync(new URL('../data/build/claims.json', import.meta.url), 'utf8'));
  const bike = claimChartPrepare(claims.find((c) => c.id === 'bike-lanes').chart);
  assert.equal(bike.groups.length, 2);
  assert.deepEqual(bike.seriesLabels, ['Bond Financing', 'TransNet Funds', 'Trench Cut/Excavation Fee Fund']);
  assert.ok(bike.groups[0].series.some((s) => s.amount_m === 0));
  const line = claimChartPrepare(claims.find((c) => c.id === 'homelessness').chart);
  assert.deepEqual(line.points.map((p) => p.fy), [2021, 2022, 2023, 2024, 2025, 2026]);
});

test('deficit bars stack the skipped reserve deposit on top of the excluding-reserves value', () => {
  const p = prepare(data);
  const by = Object.fromEntries(p.bars.map((b) => [b.fy, b]));
  assert.deepEqual([2022, 2023, 2024, 2025, 2026, 2027].map((fy) => by[fy].top_m), [107.4, 62.6, 99.5, 203.8, 103.6, 91.3]);
  assert.deepEqual([2022, 2023, 2024, 2025, 2026, 2027].map((fy) => by[fy].solid_m), [96.7, 38.3, 99.5, 181.4, 48.0, 11.2]);
  assert.equal(by[2025].reserve_m, 22.4);
  assert.equal(by[2024].reserve_m, 0);
  assert.equal(by[2024].top_figure, null);
  assert.equal(by[2025].top_figure.value, 203.8);
  assert.equal(by[2025].top_figure.source.page, 78);
  assert.match(by[2025].top_figure.source.doc, /^derived: .*including reserves/);
  assert.equal(p.stats.max_top_m, 203.8);
  assert.equal(p.stats.peak_top_m, 203.8);
  assert.ok(Math.abs(p.stats.peak_share - 181.4 / 2160.943) < 1e-9);
});

test('FY2012 one-time money is split into 21.0 solid plus 14.1 skipped reserve, not added', () => {
  const b = prepare(data).bars.find((x) => x.fy === 2012);
  assert.equal(b.value_m, 35.1);
  assert.equal(b.solid_m, 21.0);
  assert.equal(b.reserve_m, 14.1);
  assert.equal(b.top_m, 35.1);
  for (const fy of [2015, 2016, 2017, 2021]) {
    const u = prepare(data).bars.find((x) => x.fy === fy);
    assert.equal(u.top_m, null);
    assert.equal(u.reserve_m, 0);
  }
});

import { kindEntries } from '../site/charts/sankey.js';
test('sankey key names every rule, including borrowed money and its bond source', () => {
  const flows = JSON.parse(readFileSync(new URL('../data/build/flows.json', import.meta.url), 'utf8'));
  const entries = kindEntries(sankeyPrepare(flows));
  assert.deepEqual(entries.map((e) => e.kind).sort(), ['borrowed', 'discretionary', 'restricted', 'utility']);
  const b = entries.find((e) => e.kind === 'borrowed');
  assert.match(b.text, /^Borrowed money/);
  assert.ok(b.text.includes('Bonds (borrowed for capital projects)'));
  assert.ok(b.text.includes('Borrowed money: capital projects the Council picks'));
});

test('homelessness line carries FY2027 adopted amount as a separate sourced point', () => {
  const claims = JSON.parse(readFileSync(new URL('../data/build/claims.json', import.meta.url), 'utf8'));
  const line = claimChartPrepare(claims.find((c) => c.id === 'homelessness').chart);
  assert.equal(line.next.fy, 2027);
  assert.equal(line.next.amount_m, 62.0);
  assert.equal(line.next.figure.source.page, 89);
  assert.ok(!line.points.some((p) => p.fy === 2027));
  assert.match(line.summary, /FY2027 adopted budget, not yet in the open data: \$62\.0M/);
});
