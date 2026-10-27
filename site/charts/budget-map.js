// Opening section: pots bar and twin drill-down treemaps.
// This file is the pure logic only (no DOM, no d3 at the top level); render() is added on top of it later.
//
// Tree contract (data/build/budget_tree.json, docs/data-contracts.md). Ruling R11: absent === null. A node omits
// children / offsets / src, and a descs entry omits src / link, when the value would be null. Every read below goes
// through `?? null` or `?? []`.
//
// Share rule: a share is node.value_m / (the parent's children + offsets, summed). It is never taken against the
// parent's own value_m, because the parent can be a different fiscal year from its children. Police is FY2027
// (718.3) but its children are FY2026 detail; a child's share is against the FY2026 children total.
import { money } from '../format.js';

const MIN_SIDE = 0.5; // every positive item gets at least this many px in both directions
const MIN_AREA = 4; // area floor (px squared) so a tiny item never degenerates into a sliver
export const EVERYTHING_ELSE_NOTE = 'Smaller lines combined; too small to list separately.';
export const POT_QUESTIONS = [
  ['what', 'What it is'],
  ['money_from', 'Where its money comes from'],
  ['committed_to', "What it's committed to"],
  ['who_decides', 'Who decides'],
];
const DETAIL_SENTENCE = /\s*The detail below is from last year's budget \(FY\d{4}\), because this year's line-by-line data isn't published yet\.\s*$/;

const kids = (n) => n?.children ?? [];
const num = (x) => (Number.isFinite(x) ? x : 0);
const resolve = (tree, key) => (key != null ? (tree.sources?.[key] ?? null) : null);

// ---- layout (squarified treemap) ----

// Fit `lens` (a row's item lengths) to sum exactly to `total`, none below MIN_SIDE.
function fitLengths(lens, total) {
  const n = lens.length;
  if (total <= MIN_SIDE * n) return lens.map(() => total / n);
  const out = lens.slice();
  const fixed = new Array(n).fill(false);
  for (let pass = 0; pass <= n; pass++) {
    const nFixed = fixed.filter(Boolean).length;
    const freeSum = lens.reduce((s, v, i) => (fixed[i] ? s : s + v), 0);
    const scale = (total - MIN_SIDE * nFixed) / freeSum;
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) { out[i] = MIN_SIDE; continue; }
      out[i] = lens[i] * scale;
      if (out[i] < MIN_SIDE) { fixed[i] = true; out[i] = MIN_SIDE; changed = true; }
    }
    if (!changed) break;
  }
  return out;
}

// Squarified treemap (Bruls et al.), same row-growing rule as the approved mockup, with MIN_SIDE enforced.
// Returns {item, x, y, w, h}[] in input order. Items with value_m <= 0 get a zero-size rectangle.
export function layout(items, x, y, w, h) {
  const res = items.map((item) => ({ item, x, y, w: 0, h: 0 }));
  const pos = [];
  items.forEach((item, i) => { if (num(item.value_m) > 0) pos.push({ i, v: item.value_m }); });
  if (!pos.length || !(w > 0) || !(h > 0)) return res;
  const area = w * h;
  const tot = pos.reduce((s, d) => s + d.v, 0);
  let rest = pos.map((d) => ({ i: d.i, a: (d.v / tot) * area }));
  // Floor tiny areas, taking the difference from the larger items pro rata.
  if (rest.length * MIN_AREA < area) {
    const small = rest.filter((d) => d.a < MIN_AREA);
    if (small.length) {
      const give = small.reduce((s, d) => s + (MIN_AREA - d.a), 0);
      const bigSum = rest.reduce((s, d) => (d.a >= MIN_AREA ? s + d.a : s), 0);
      const k = (bigSum - give) / bigSum;
      rest = rest.map((d) => ({ i: d.i, a: d.a < MIN_AREA ? MIN_AREA : d.a * k }));
    }
  }
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [];
    let best = Infinity;
    for (const it of rest) {
      const r = [...row, it];
      const s = r.reduce((a, b) => a + b.a, 0);
      const mx = Math.max(...r.map((q) => q.a));
      const mn = Math.min(...r.map((q) => q.a));
      const worst = Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
      if (worst <= best) { best = worst; row = r; } else break;
    }
    const s = row.reduce((a, b) => a + b.a, 0);
    const last = row.length === rest.length;
    // A non-last row must leave MIN_SIDE of room for each item after it, so the last items never become slivers.
    const room = MIN_SIDE * (rest.length - row.length);
    if (w >= h) {
      const rw = last ? w : Math.min(Math.max(s / h, MIN_SIDE), Math.max(w - room, MIN_SIDE), w);
      const lens = fitLengths(row.map((q) => q.a / rw), h);
      let yy = y;
      row.forEach((q, k) => { Object.assign(res[q.i], { x, y: yy, w: rw, h: lens[k] }); yy += lens[k]; });
      x += rw; w -= rw;
    } else {
      const rh = last ? h : Math.min(Math.max(s / w, MIN_SIDE), Math.max(h - room, MIN_SIDE), h);
      const lens = fitLengths(row.map((q) => q.a / rh), w);
      let xx = x;
      row.forEach((q, k) => { Object.assign(res[q.i], { x: xx, y, w: lens[k], h: rh }); xx += lens[k]; });
      y += rh; h -= rh;
    }
    rest = rest.slice(row.length);
  }
  return res;
}

// ---- drill state (immutable updates) ----

export function createState(tree) {
  const p = tree.pots[0];
  return { pot: p.id, in: [p.in], out: [p.out], selected: null };
}

export function selectPot(state, tree, potId) {
  const p = tree.pots.find((q) => q.id === potId);
  if (!p) return state;
  return { pot: p.id, in: [p.in], out: [p.out], selected: null };
}

// A node with children opens as the new map root (and is selected so its panel shows).
// A node without children only becomes selected: Enter or Space on it never changes the path.
export function activate(state, side, node) {
  const selected = { side, node };
  if (kids(node).length) return { ...state, [side]: [...state[side], node], selected };
  return { ...state, selected };
}

// Truncate to path[0..depth]. Clamped to at least the root and at most the current length.
export function goUp(state, side, depth) {
  const keep = Math.min(Math.max(depth + 1, 1), state[side].length);
  return { ...state, [side]: state[side].slice(0, keep), selected: null };
}

export function crumbs(path) {
  return path.map((n, depth) => ({ name: n.name, depth, current: depth === path.length - 1 }));
}

// ---- models ----

// Children plus offsets (offsets are negative). A leaf sums to its own value.
export function childrenTotal(node) {
  if (!kids(node).length) return num(node.value_m);
  return kids(node).reduce((s, c) => s + c.value_m, 0) + (node.offsets ?? []).reduce((s, o) => s + o.value_m, 0);
}

// "$1.70B" in headers: two decimals for billions even when the last is zero (format.money trims it to "$1.7B").
function headerMoney(m) {
  return Math.abs(m) >= 999.5 ? `${m < 0 ? '-' : ''}$${(Math.abs(m) / 1000).toFixed(2)}B` : money(m);
}

// isDetail: the children are a different year from the bar year or from the node itself (e.g. FY2026 lines under an
// FY2027 box, or any CSV-backed pot). The header then states the children's own year and their own sum.
export function mapHeader(node, tree) {
  const cs = kids(node);
  const total_m = childrenTotal(node);
  const child = cs.find((c) => c.fy !== tree.bar_fy || c.fy !== node.fy);
  const isDetail = cs.length ? child !== undefined : node.fy !== tree.bar_fy;
  const fy = child ? child.fy : node.fy;
  const text = `FY${fy}${isDetail ? ' detail' : ''}: ${headerMoney(total_m)}`;
  return { text, total_m, fy, isDetail };
}

// src: the description's source if it has one, else the amount's source. amount_src: the source of the number itself.
// descSrc: the source of the description alone. All three are Source objects or null.
export function nodePanel(node, parent, tree) {
  const d = tree.descs?.[node.key] ?? null;
  const total = parent ? childrenTotal(parent) : 0;
  const amount_src = resolve(tree, node.src ?? null);
  const descSrc = resolve(tree, d?.src ?? null);
  const leafMisc = node.key === '_everything_else' && !kids(node).length;
  return {
    title: node.name,
    amount_m: node.value_m,
    share: parent && total > 0 ? node.value_m / total : null,
    fy: node.fy,
    text: (leafMisc ? tree.descs?._everything_else?.text : d?.text) ?? null,
    src: descSrc ?? amount_src,
    amount_src,
    descSrc,
    link: d?.link ?? null,
    opens: kids(node).length > 0,
    offsets: node.offsets ?? null,
    note: leafMisc ? EVERYTHING_ELSE_NOTE : null,
  };
}

export function potPanel(pot, tree) {
  const sameYear = tree.detail_fy === tree.bar_fy;
  const answers = POT_QUESTIONS.filter(([k]) => pot.answers?.[k]).map(([k, q]) => {
    const a = pot.answers[k];
    const text = k === 'what' && sameYear ? a.text.replace(DETAIL_SENTENCE, '') : a.text;
    return { q, text, src: resolve(tree, a.src ?? null) };
  });
  const notes = [];
  const hi = mapHeader(pot.in, tree);
  const ho = mapHeader(pot.out, tree);
  const big = Math.max(hi.total_m, ho.total_m);
  if (big > 0 && Math.abs(hi.total_m - ho.total_m) / big > 0.01) {
    notes.push(
      `The two maps total different amounts (money in ${hi.text}; money out ${ho.text}), because revenue and spending are budgeted separately for this group. Read each map as its own total.`,
    );
  }
  const barTotal = tree.pots.reduce((s, p) => s + p.value_m, 0);
  return {
    title: pot.label,
    value_m: pot.value_m,
    share: barTotal > 0 ? pot.value_m / barTotal : null,
    src: resolve(tree, pot.src ?? null),
    answers,
    notes,
  };
}

// The list equivalent of a map: every child, tiny ones included.
export function listModel(node) {
  return kids(node).map((c) => ({ name: c.name, value_m: c.value_m, opens: kids(c).length > 0 }));
}
