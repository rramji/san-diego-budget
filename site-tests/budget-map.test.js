import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as bm from '../site/charts/budget-map.js';

const tree = JSON.parse(readFileSync(new URL('../data/build/budget_tree.json', import.meta.url), 'utf8'));
const pot = (id) => tree.pots.find((p) => p.id === id);
const byName = (n, name) => n.children.find((c) => c.name === name);
const sumKids = (n) => n.children.reduce((s, c) => s + c.value_m, 0) + (n.offsets ?? []).reduce((s, o) => s + o.value_m, 0);

function overlap(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 1e-6 && oy > 1e-6;
}

test('layout areas proportional, inside bounds, tiny items visible', () => {
  const items = [500, 300, 150, 49, 1].map((v) => ({ value_m: v }));
  const r = bm.layout(items, 0, 0, 320, 240);
  const tot = 320 * 240;
  r.forEach((q, i) => {
    assert.equal(q.item, items[i]);
    if (i < 4) assert.ok(Math.abs(q.w * q.h - (items[i].value_m / 1000) * tot) < 0.01 * (items[i].value_m / 1000) * tot);
    assert.ok(q.x >= -1e-9 && q.y >= -1e-9 && q.x + q.w <= 320 + 1e-9 && q.y + q.h <= 240 + 1e-9);
    assert.ok(q.w >= 0.5 && q.h >= 0.5);
  });
  assert.deepEqual(bm.layout([], 0, 0, 10, 10), []);
});

test('layout: non-positive values get no area, never NaN; offset origin respected', () => {
  const items = [{ value_m: 10 }, { value_m: 0 }, { value_m: -5 }, { value_m: 30 }];
  const r = bm.layout(items, 100, 50, 200, 100);
  assert.equal(r.length, 4);
  assert.equal(r[1].w * r[1].h, 0);
  assert.equal(r[2].w * r[2].h, 0);
  for (const q of r) for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(q[k]));
  assert.ok(Math.abs(r[0].w * r[0].h - 5000) < 1e-6 && Math.abs(r[3].w * r[3].h - 15000) < 1e-6);
  assert.ok(r[0].x >= 100 - 1e-9 && r[3].y >= 50 - 1e-9 && r[3].x + r[3].w <= 300 + 1e-9);
  assert.equal(bm.layout([{ value_m: 0 }], 0, 0, 10, 10)[0].w, 0);
});

test('layout: 0.1% share child at 375px gets w,h >= 0.5, no overlaps, inside bounds (Review Focus 4)', () => {
  const W = 375 - 32, H = 260;
  const cases = [
    [900, 80, 19, 1],
    [1000, 1],
    [500, 300, 150, 40, 9, 0.9, 0.09, 0.009],
    [2256.7, 2.2, 0.1, 0.05],
  ];
  for (const vals of cases) {
    const items = vals.map((v) => ({ value_m: v }));
    const r = bm.layout(items, 16, 0, W, H);
    r.forEach((q) => {
      assert.ok(q.w >= 0.5 - 1e-9 && q.h >= 0.5 - 1e-9, `size ${q.w}x${q.h} for ${vals}`);
      assert.ok(q.x >= 16 - 1e-9 && q.y >= -1e-9 && q.x + q.w <= 16 + W + 1e-9 && q.y + q.h <= H + 1e-9);
    });
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) assert.ok(!overlap(r[i], r[j]), `overlap ${i},${j} for ${vals}`);
  }
  // the exact 0.1% case
  const r = bm.layout([{ value_m: 999 }, { value_m: 1 }], 16, 0, W, H);
  assert.ok(r[1].w >= 0.5 && r[1].h >= 0.5);
});

test('layout fuzz: ten children of mixed magnitude always visible, in bounds, disjoint', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(rnd() * 10);
    const items = Array.from({ length: n }, () => ({ value_m: 10 ** (rnd() * 4 - 2) })).sort((a, b) => b.value_m - a.value_m);
    const [W, H] = rnd() < 0.5 ? [343, 260] : [600, 240];
    const r = bm.layout(items, 0, 0, W, H);
    r.forEach((q) => {
      assert.ok(q.w >= 0.5 - 1e-9 && q.h >= 0.5 - 1e-9, `size ${q.w}x${q.h}`);
      assert.ok(q.x >= -1e-9 && q.y >= -1e-9 && q.x + q.w <= W + 1e-6 && q.y + q.h <= H + 1e-6);
    });
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) assert.ok(!overlap(r[i], r[j]));
  }
});

test('activate drills only nodes with children; pot change resets both maps', () => {
  let s = bm.createState(tree);
  assert.equal(s.pot, 'general_fund');
  assert.equal(s.out.length, 1);
  assert.equal(s.in.length, 1);
  assert.equal(s.out[0], pot('general_fund').out);
  assert.equal(s.in[0], pot('general_fund').in);
  assert.equal(s.selected, null);
  const police = byName(s.out[0], 'Police');
  s = bm.activate(s, 'out', police);
  assert.equal(s.out.length, 2);
  assert.equal(s.in.length, 1);
  assert.equal(s.out[1], police);
  const leaf = police.children.find((c) => !c.children);
  assert.ok(leaf, 'Police has a leaf category');
  const s2 = bm.activate(s, 'out', leaf);
  assert.equal(s2.out.length, 2);
  assert.equal(s2.selected.node, leaf);
  assert.equal(s2.selected.side, 'out');
  s = bm.selectPot(s2, tree, 'utilities');
  assert.equal(s.pot, 'utilities');
  assert.equal(s.out.length, 1);
  assert.equal(s.in.length, 1);
  assert.equal(s.out[0], pot('utilities').out);
  assert.equal(s.selected, null);
  assert.equal(bm.goUp(bm.activate(s, 'out', s.out[0].children[0]), 'out', 0).out.length, 1);
});

test('selectPot while both maps are drilled resets both (Review Focus 3)', () => {
  let s = bm.createState(tree);
  s = bm.activate(s, 'out', byName(s.out[0], 'Police'));
  s = bm.activate(s, 'in', s.in[0].children.find((c) => c.children));
  assert.equal(s.out.length, 2);
  assert.equal(s.in.length, 2);
  s = bm.selectPot(s, tree, 'cip');
  assert.deepEqual([s.pot, s.out.length, s.in.length, s.selected], ['cip', 1, 1, null]);
});

test('activate on a leaf (Enter/Space) shows details and keeps the path', () => {
  let s = bm.createState(tree);
  s = bm.activate(s, 'out', byName(s.out[0], 'Police'));
  const before = { in: s.in, out: s.out };
  s = { ...s, selected: null };
  const leaf = s.out[1].children.find((c) => !c.children);
  const s2 = bm.activate(s, 'out', leaf);
  assert.deepEqual(s2.out, before.out);
  assert.deepEqual(s2.in, before.in);
  assert.deepEqual(s2.selected, { side: 'out', node: leaf });
  assert.equal(s.selected, null, 'input state not mutated');
  const s3 = bm.activate(s2, 'out', leaf);
  assert.equal(s3.out.length, 2);
});

test('goUp truncates to depth + 1 and clamps', () => {
  let s = bm.createState(tree);
  const police = byName(s.out[0], 'Police');
  s = bm.activate(s, 'out', police);
  s = bm.activate(s, 'out', police.children[0]);
  assert.equal(s.out.length, 3);
  assert.equal(bm.goUp(s, 'out', 1).out.length, 2);
  assert.equal(bm.goUp(s, 'out', 0).out.length, 1);
  assert.equal(bm.goUp(s, 'out', 9).out.length, 3);
  assert.equal(bm.goUp(s, 'out', -4).out.length, 1);
  assert.equal(bm.goUp(s, 'out', 0).selected, null);
});

test('detail header for a CSV pot uses the children sum, never the bar value', () => {
  const u = pot('utilities');
  const h = bm.mapHeader(u.out, tree);
  assert.equal(h.isDetail, true);
  assert.match(h.text, /^FY2026 detail: \$1\.\d\dB$/);
  assert.notEqual(h.total_m, 1915.1);
  assert.ok(Math.abs(h.total_m - sumKids(u.out)) < 1e-9);
  assert.equal(h.fy, 2026);
  assert.match(bm.potPanel(u, tree).answers[0].text, /last year's budget/);
});

test('mapHeader: FY2027 map is not detail; a drilled FY2027 node over FY2026 children is', () => {
  const gf = pot('general_fund');
  const h = bm.mapHeader(gf.out, tree);
  assert.equal(h.isDetail, false);
  assert.equal(h.fy, 2027);
  assert.equal(h.text, 'FY2027: $2.26B');
  const police = byName(gf.out, 'Police');
  const hp = bm.mapHeader(police, tree);
  assert.equal(hp.isDetail, true);
  assert.equal(hp.fy, 2026);
  assert.ok(Math.abs(hp.total_m - sumKids(police)) < 1e-9);
  assert.notEqual(hp.total_m, police.value_m);
  assert.match(hp.text, /^FY2026 detail: \$\d+(\.\d)?[MB]$|^FY2026 detail: \$\d+M$/);
  assert.equal(bm.mapHeader(pot('cip').out, tree).isDetail, false);
});

test('mapHeader total includes offsets (negative credits)', () => {
  const t = { bar_fy: 2027, detail_fy: 2026, sources: {}, descs: {}, pots: [] };
  const n = { name: 'X', key: 'X', value_m: 80, fy: 2026, children: [{ name: 'a', key: 'a', value_m: 100, fy: 2026 }], offsets: [{ name: 'credit', value_m: -20 }] };
  const h = bm.mapHeader(n, t);
  assert.equal(h.total_m, 80);
  assert.equal(h.text, 'FY2026 detail: $80M');
});

test('crumbs mark only the last step current', () => {
  let s = bm.createState(tree);
  const police = byName(s.out[0], 'Police');
  assert.deepEqual(bm.crumbs(s.out), [{ name: 'General Fund money out', depth: 0, current: true }]);
  s = bm.activate(s, 'out', police);
  assert.deepEqual(bm.crumbs(s.out), [
    { name: 'General Fund money out', depth: 0, current: false },
    { name: 'Police', depth: 1, current: true },
  ]);
  s = bm.activate(s, 'out', police.children[0]);
  const c = bm.crumbs(s.out);
  assert.deepEqual(c.map((x) => x.depth), [0, 1, 2]);
  assert.deepEqual(c.map((x) => x.current), [false, false, true]);
  assert.equal(c[2].name, 'Salaries & other pay');
});

test('nodePanel on GF out > Police: exact amount, same-year share, opens', () => {
  const root = pot('general_fund').out;
  const police = byName(root, 'Police');
  const p = bm.nodePanel(police, root, tree);
  assert.equal(p.title, 'Police');
  assert.equal(p.amount_m, 718.3);
  assert.equal(p.fy, 2027);
  assert.ok(Math.abs(p.share - 718.3 / sumKids(root)) < 1e-12);
  assert.equal(p.opens, true);
  assert.equal(p.offsets, null);
  assert.equal(typeof p.src, 'object');
  assert.match(p.src.doc, /./);
});

test('share of an FY2026 child is against the FY2026 children total, not the FY2027 parent value', () => {
  const police = byName(pot('general_fund').out, 'Police');
  const sal = byName(police, 'Salaries & other pay');
  const p = bm.nodePanel(sal, police, tree);
  assert.ok(Math.abs(p.share - sal.value_m / sumKids(police)) < 1e-12);
  assert.notEqual(p.share, sal.value_m / police.value_m);
  assert.equal(p.fy, 2026);
  assert.equal(bm.nodePanel(police, null, tree).share, null);
});

test('nodePanel passes offsets through, resolves description text, link and sources', () => {
  const u = pot('utilities').out;
  const withOff = (function find(n) {
    if (n.offsets) return [n];
    for (const c of n.children ?? []) { const r = find(c); if (r) return r; }
    return null;
  })(u);
  assert.ok(withOff, 'some utilities node has offsets');
  const p = bm.nodePanel(withOff[0], u, tree);
  assert.deepEqual(p.offsets, withOff[0].offsets);
  assert.ok(p.offsets.every((o) => o.value_m < 0));
  const pension = { name: 'Pension payment', key: 'Pension payment', value_m: 10, fy: 2026, src: 's0' };
  const pp = bm.nodePanel(pension, { children: [pension], value_m: 10, fy: 2026 }, tree);
  assert.equal(pp.text, tree.descs['Pension payment'].text);
  assert.equal(pp.link, '#pension');
});

test('leaf "Everything else" box: text from descs._everything_else plus a smaller-lines note', () => {
  let leafBox = null; let parent = null;
  (function walk(n) {
    for (const c of n.children ?? []) {
      if (c.key === '_everything_else' && !c.children && !leafBox) { leafBox = c; parent = n; }
      walk(c);
    }
  })(pot('utilities').out);
  assert.ok(leafBox);
  const p = bm.nodePanel(leafBox, parent, tree);
  assert.equal(p.text, tree.descs._everything_else.text);
  assert.equal(p.opens, false);
  assert.equal(p.note, 'Smaller lines combined; too small to list separately.');
  const police = byName(pot('general_fund').out, 'Police');
  assert.equal(bm.nodePanel(police, pot('general_fund').out, tree).note, null);
});

test('R11: absent children / offsets / src / desc src / desc link are treated as null everywhere', () => {
  const t = {
    bar_fy: 2027, detail_fy: 2026, sources: { s0: { doc: 'D', page: null, url: 'https://x.y/z' } },
    descs: { A: { text: 'about A' }, B: { text: 'about B', src: 's0', link: '#b' }, _everything_else: { text: 'misc' } },
    pots: [],
  };
  const a = { name: 'A', key: 'A', value_m: 60, fy: 2026 };
  const b = { name: 'B', key: 'B', value_m: 40, fy: 2026, src: 's0' };
  const root = { name: 'R', key: 'R', value_m: 100, fy: 2026, children: [a, b] };
  assert.equal('children' in a, false);
  assert.deepEqual(bm.listModel(a), []);
  const pa = bm.nodePanel(a, root, t);
  assert.deepEqual([pa.opens, pa.offsets, pa.src, pa.amount_src, pa.link, pa.text, pa.share], [false, null, null, null, null, 'about A', 0.6]);
  const pb = bm.nodePanel(b, root, t);
  assert.deepEqual(pb.src, t.sources.s0);
  assert.equal(pb.link, '#b');
  assert.equal(bm.mapHeader(a, t).total_m, 60);
  assert.equal(bm.mapHeader(a, t).isDetail, true);
  assert.equal(bm.mapHeader(root, t).total_m, 100);
  let s = { pot: 'x', in: [root], out: [root], selected: null };
  assert.equal(bm.activate(s, 'out', a).out.length, 1);
  assert.equal(bm.activate(s, 'out', a).selected.node, a);
  assert.equal(bm.activate(s, 'out', root).out.length, 2, 'a node with children still drills');
  assert.deepEqual(bm.nodePanel({ name: 'Q', key: 'nokey', value_m: 1, fy: 2026 }, null, t).text, null);
});

test('potPanel: four labelled answers in order, resolved sources, no notes for a balanced pot', () => {
  const gf = pot('general_fund');
  const p = bm.potPanel(gf, tree);
  assert.equal(p.title, 'General Fund');
  assert.equal(p.value_m, 2256.7);
  assert.deepEqual(p.answers.map((a) => a.q), ['What it is', 'Where its money comes from', "What it's committed to", 'Who decides']);
  assert.equal(p.answers[0].text, gf.answers.what.text);
  assert.equal(p.answers[1].text, gf.answers.money_from.text);
  assert.equal(p.answers[2].text, gf.answers.committed_to.text);
  assert.equal(p.answers[3].text, gf.answers.who_decides.text);
  assert.deepEqual(p.answers[0].src, tree.sources[gf.answers.what.src]);
  const total = tree.pots.reduce((s, q) => s + q.value_m, 0);
  assert.ok(Math.abs(p.share - 2256.7 / total) < 1e-12);
  assert.deepEqual(p.notes, []);
});

test('potPanel: in/out mismatch over 1% adds a note naming both totals', () => {
  const p = bm.potPanel(pot('utilities'), tree);
  assert.equal(p.notes.length, 1);
  assert.match(p.notes[0], /\$2\.02B/);
  assert.match(p.notes[0], /\$1\.70B/);
  assert.match(p.notes[0], /FY2026 detail/);
  assert.doesNotMatch(p.notes[0], /because|budgeted separately/); // the cause is unsourced, so it is not stated
  for (const q of tree.pots) {
    const a = bm.mapHeader(q.in, tree).total_m, b = bm.mapHeader(q.out, tree).total_m;
    const mism = Math.abs(a - b) / Math.max(a, b) > 0.01;
    assert.equal(bm.potPanel(q, tree).notes.length, mism ? 1 : 0, q.id);
  }
});

test('potPanel strips the detail-year sentence only when detail_fy equals bar_fy (cloned tree)', () => {
  const sentence = /The detail below is from last year's budget/;
  assert.match(bm.potPanel(pot('utilities'), tree).answers[0].text, sentence);
  const t2 = structuredClone(tree);
  t2.detail_fy = t2.bar_fy;
  for (const p of t2.pots) {
    if (p.answers) p.answers.what.text = p.answers.what.text.replace(/\(FY2026\)/, `(FY${t2.bar_fy})`);
  }
  const u2 = t2.pots.find((p) => p.id === 'utilities');
  const text = bm.potPanel(u2, t2).answers[0].text;
  assert.doesNotMatch(text, sentence);
  assert.doesNotMatch(text, /isn't published yet/);
  assert.ok(text.startsWith('City services that charge'));
  assert.ok(text.endsWith('airports.'));
  assert.equal(tree.pots.find((p) => p.id === 'utilities').answers.what.text.includes('last year'), true, 'original untouched');
});

test('list model includes every child, including tiny ones', () => {
  for (const q of tree.pots) for (const root of [q.in, q.out]) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      const lm = bm.listModel(n);
      assert.equal(lm.length, (n.children ?? []).length);
      lm.forEach((r, i) => {
        const c = n.children[i];
        assert.deepEqual(r, { name: c.name, value_m: c.value_m, opens: (c.children ?? []).length > 0 });
      });
      stack.push(...(n.children ?? []));
    }
  }
  const police = byName(pot('general_fund').out, 'Police');
  const lm = bm.listModel(police);
  assert.equal(lm.length, police.children.length);
  assert.equal(lm[0].opens, true);
  assert.equal(lm[3].opens, false);
  assert.deepEqual(bm.listModel({ name: 'x', value_m: 1, fy: 2026 }), []);
});

// ---- Task 8: render-side pure helpers ----

test('potSegments: five segments over the five-pot sum, with the brief\'s aria-label', () => {
  const segs = bm.potSegments(tree);
  const sum = tree.pots.reduce((s, p) => s + p.value_m, 0);
  assert.equal(segs.length, 5);
  assert.equal(segs[0].x0, 0);
  assert.ok(Math.abs(segs[4].x1 - 1) < 1e-12);
  segs.forEach((g, i) => {
    assert.ok(Math.abs(g.x1 - g.x0 - tree.pots[i].value_m / sum) < 1e-12);
    if (i) assert.equal(g.x0, segs[i - 1].x1);
  });
  assert.equal(segs[0].aria, `General Fund, $2.26B, ${Math.round((2256.7 / sum) * 100)}% of the budget`);
});

test('cellModels: sorted largest first, colour slot follows the tree order, aria names share and opening', () => {
  const out = pot('general_fund').out;
  const cells = bm.cellModels(out, tree);
  assert.equal(cells.length, out.children.length);
  for (let i = 1; i < cells.length; i++) assert.ok(cells[i - 1].node.value_m >= cells[i].node.value_m);
  const police = cells.find((c) => c.node.name === 'Police');
  assert.equal(police.slot, out.children.indexOf(police.node));
  assert.equal(police.opens, true);
  assert.match(police.aria, /^Police, \$718M, 32% of General Fund money out, opens further$/);
  // a detail-year child under an FY2027 parent says which year its share is from
  const pol = byName(out, 'Police');
  const ot = bm.cellModels(pol, tree).find((c) => c.node.name === 'Overtime');
  assert.equal(ot.opens, false);
  assert.match(ot.aria, /^Overtime, \$45\.3M, \d+% of Police in FY2026$/);
});

test('headerFigure: own source when the map total is the node value, our arithmetic otherwise', () => {
  const u = bm.headerFigure(pot('utilities').in, tree);
  assert.equal(u.prefix, 'FY2026 detail: ');
  assert.equal(u.amount, '$2.02B');
  assert.equal(u.ours, false);
  assert.deepEqual(u.source, tree.sources[pot('utilities').in.src]);
  const pol = byName(pot('general_fund').out, 'Police');
  const h = bm.headerFigure(pol, tree);
  assert.equal(h.ours, true);
  assert.match(h.source.doc, /^our arithmetic: /);
  assert.match(h.source.doc, new RegExp(`= ${bm.childrenTotal(pol).toFixed(1)}`));
  assert.ok(h.source.url.startsWith('https://'));
});

test('offsetsFigure: credits summed with a minus sign; one line keeps its own source', () => {
  const sal = byName(byName(pot('general_fund').out, 'Police'), 'Salaries & other pay');
  const f = bm.offsetsFigure(sal, tree);
  const sum = sal.offsets.reduce((s, o) => s + o.value_m, 0);
  assert.ok(Math.abs(f.value_m - sum) < 1e-9 && f.value_m < 0);
  assert.equal(f.text, `−$${Math.abs(sum).toFixed(1)}M`);
  assert.equal(f.ours, sal.offsets.length > 1);
  if (f.ours) assert.match(f.source.doc, /^our arithmetic: /);
  assert.equal(bm.offsetsFigure(pot('general_fund').out, tree), null);
  const one = { ...sal, offsets: [sal.offsets[0]] };
  const g = bm.offsetsFigure(one, tree);
  assert.equal(g.ours, false);
  assert.deepEqual(g.source, tree.sources[sal.src]);
});

test('inkOn: dark ink on light fills, white on dark fills', () => {
  assert.equal(bm.inkOn('#eda100', '#ffffff', '#1c2530'), '#1c2530');
  assert.equal(bm.inkOn('#2a78d6', '#ffffff', '#1c2530'), '#ffffff');
  assert.equal(bm.inkOn('#008300', '#ffffff', '#1c2530'), '#ffffff');
});

test('isOurs flags our-arithmetic sources only', () => {
  assert.equal(bm.isOurs(tree.sources[pot('internal').src]), true);
  assert.equal(bm.isOurs(tree.sources[pot('general_fund').src]), false);
  assert.equal(bm.isOurs(null), false);
});

test('statusText: short spoken summary for a pot, a box and an opened box', () => {
  assert.equal(bm.statusText(pot('general_fund'), null, tree), 'General Fund, $2.26B, FY2027');
  assert.equal(bm.statusText(pot('internal'), null, tree), 'Internal services & other, $249M (our arithmetic), FY2027');
  const police = byName(pot('general_fund').out, 'Police');
  assert.equal(bm.statusText(null, police, tree, true), 'Police, $718M, FY2027, opened');
  assert.equal(bm.statusText(null, byName(police, 'Overtime'), tree), 'Overtime, $45.3M, FY2026');
});

test('wrapWords sets whole words only, never truncating', () => {
  const fits = (s) => s.length <= 10;
  assert.equal(bm.wrapWords('Charges for Current Services', fits, 3), null); // needs four lines
  assert.deepEqual(bm.wrapWords('Charges for Current Services', fits, 4), ['Charges', 'for', 'Current', 'Services']);
  assert.deepEqual(bm.wrapWords('Sales Tax', fits, 1), ['Sales Tax']);
  assert.deepEqual(bm.wrapWords('Parks & Recreation', fits, 2), ['Parks &', 'Recreation']);
  assert.equal(bm.wrapWords('Transportation', fits, 3), null); // one word wider than the box
  assert.equal(bm.wrapWords('', fits, 3), null);
});
