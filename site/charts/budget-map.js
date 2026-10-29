// Opening section: pots bar and twin drill-down treemaps.
// The pure logic comes first (importable in Node). The DOM renderers at the bottom (renderPots, render) touch the
// document only when called.
//
// Tree contract (data/build/budget_tree.json, docs/data-contracts.md). Ruling R11: absent === null. A node omits
// children / offsets / src, and a descs entry omits src / link, when the value would be null. Every read below goes
// through `?? null` or `?? []`.
//
// Share rule: a share is node.value_m / (the parent's children + offsets, summed). It is never taken against the
// parent's own value_m, because the parent can be a different fiscal year from its children. Police is FY2027
// (718.3) but its children are FY2026 detail; a child's share is against the FY2026 children total.
import { money } from '../format.js';
import { isOurs, OURS, OURS_PREFIX, fig } from '../sources.js';

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
    note: leafMisc && !node.lines ? EVERYTHING_ELSE_NOTE : null,
    lines: leafMisc ? linesSummary(node) : null,
  };
}

// A closed "Everything else": how many lines it combines and its largest few, as {lead, items: [{name, value_m}],
// rest}. Null when the tree has no summary for the box.
export function linesSummary(node) {
  const l = node.lines;
  if (!l) return null;
  const items = l.top.map(([name, value_m]) => ({ name, value_m }));
  const lead = l.n > items.length
    ? `It combines ${l.n} smaller lines of the city's budget data. The ${items.length} largest:`
    : `It combines ${l.n === 1 ? 'one line' : `${l.n} lines`} of the city's budget data:`;
  const more = l.n - items.length;
  const rest = [more > 0 ? `${more} more line${more === 1 ? '' : 's'}` : '', l.small_m ? `lines under ${money(0.05)} each, ${money(l.small_m)} in all` : '']
    .filter(Boolean);
  return { lead, items, rest: rest.length ? `Plus ${rest.join(', and ')}.` : null };
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
      `The two maps total different amounts (money in ${hi.text}; money out ${ho.text}). Read each map as its own total.`,
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

// ---- render-side models (pure) ----

export { isOurs }; // one rule for the whole site, from sources.js

// "32%", or "less than 1%" so a real share never reads as 0%.
export function shareText(x) {
  if (x == null) return null;
  return x < 0.005 ? 'less than 1%' : `${Math.round(x * 100)}%`;
}

// "32% of General Fund money out", plus the year when the child is a different year from its parent, so a share of
// FY2026 detail never reads as a share of the FY2027 parent value.
export function shareOf(node, parent) {
  const total = parent ? childrenTotal(parent) : 0;
  if (!(total > 0)) return null;
  const p = node.value_m / total; // same rule as nodePanel's share
  return `${shareText(p)} of ${parent.name}${node.fy !== parent.fy ? ` in FY${node.fy}` : ''}`;
}

// The pots bar: five segments, each a fraction [x0, x1) of the five-pot sum.
export function potSegments(tree) {
  const sum = tree.pots.reduce((s, p) => s + p.value_m, 0);
  let x = 0;
  return tree.pots.map((pot, i) => {
    const share = sum > 0 ? pot.value_m / sum : 0;
    const seg = { pot, slot: i, share, x0: x, x1: i === tree.pots.length - 1 ? 1 : x + share };
    seg.aria = `${pot.label}, ${money(pot.value_m)}, ${shareText(share)} of the budget`;
    x = seg.x1;
    return seg;
  });
}

// The short line the status element reads out after an action: "Overtime, $45.3M, FY2026" (plus "opened" when the
// box opened into the map, and "our arithmetic" when the amount is our own sum). A pot reads its bar value and year.
export function statusText(pot, node, tree, opened = false) {
  if (pot) {
    const ours = isOurs(resolve(tree, pot.src ?? null)) ? ` (${OURS})` : '';
    return `${pot.label}, ${money(pot.value_m)}${ours}, FY${tree.bar_fy}`;
  }
  const ours = isOurs(resolve(tree, node.src ?? null)) ? ` (${OURS})` : '';
  return `${node.name}, ${money(node.value_m)}${ours}, FY${node.fy}${opened ? ', opened' : ''}`;
}

// One map level ready to draw: largest first (squarify needs descending input), colour slot = the child's place in
// the tree's own order, so colour follows the item, not its rank.
export function cellModels(node, tree) {
  return kids(node)
    .map((c, slot) => {
      const opens = kids(c).length > 0;
      const share = shareOf(c, node);
      const aria = [c.name, money(c.value_m), share, opens ? 'opens further' : null].filter(Boolean).join(', ');
      return { node: c, slot, opens, aria };
    })
    .sort((a, b) => b.node.value_m - a.node.value_m || a.slot - b.slot);
}

const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

// The map header amount as a sourced figure. It is the node's own figure when the children add up to the node's value
// in the node's own year; otherwise (e.g. FY2026 detail under an FY2027 department) it is our sum of the boxes shown.
export function headerFigure(node, tree) {
  const h = mapHeader(node, tree);
  const cut = h.text.indexOf(': ') + 2;
  const own = resolve(tree, node.src ?? null);
  const same = h.fy === node.fy && Math.abs(h.total_m - node.value_m) <= 0.05;
  if (same && own) return { prefix: h.text.slice(0, cut), amount: h.text.slice(cut), source: own, ours: isOurs(own) };
  const terms = [...kids(node), ...(node.offsets ?? [])].map((c) => n1(c.value_m));
  const anySrc = kids(node).map((c) => resolve(tree, c.src ?? null)).find(Boolean) ?? own;
  const source = {
    doc: `${OURS_PREFIX}${terms.join(' + ')} = ${n1(h.total_m)} (the ${kids(node).length} boxes in this map${node.offsets?.length ? ' plus its credits' : ''}, FY${h.fy})`,
    page: null,
    url: anySrc?.url ?? null,
  };
  return { prefix: h.text.slice(0, cut), amount: h.text.slice(cut), source, ours: true };
}

// Credits netted into a node (offsets are negative): one figure, "−$28.8M". Two or more lines are our sum.
export function offsetsFigure(node, tree) {
  const offs = node.offsets ?? [];
  if (!offs.length) return null;
  const value_m = offs.reduce((s, o) => s + o.value_m, 0);
  const own = resolve(tree, node.src ?? null);
  const text = `−${money(Math.abs(value_m))}`;
  if (offs.length === 1) return { value_m, text, source: own, ours: isOurs(own) };
  const source = {
    doc: `${OURS_PREFIX}${offs.map((o) => `${n1(o.value_m)} (${o.name})`).join(' + ')} = ${n1(value_m)}`,
    page: own?.page ?? null,
    url: own?.url ?? null,
  };
  return { value_m, text, source, ours: true };
}

// WCAG contrast picks the label colour for text set inside a coloured fill.
function lum(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export function inkOn(fill, light, dark) {
  return contrast(fill, light) >= contrast(fill, dark) ? light : dark;
}

// ---- DOM renderers (browser only) ----

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const LINE = 16; // label line height, px
const PAD = 6;

// Greedy word wrap into at most maxLines lines, each passing fits(line). Never cuts a word or adds "…": returns
// null when the whole string can't be set that way.
export function wrapWords(str, fits, maxLines) {
  const lines = [];
  let cur = '';
  for (const w of str.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) { cur = next; continue; }
    if (!cur || !fits(w)) return null;
    lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines.length && lines.length <= maxLines ? lines : null;
}

// Label a rectangle only where the text fits inside it with padding: the whole name, wrapped, then the amount.
// Nothing is truncated. Returns true when the whole name is shown; otherwise the caller adds a hover tooltip.
function labelCell(g, r, name, amount, opens) {
  const maxW = r.w - 2 * PAD;
  const x = r.x + PAD;
  const y = r.y + PAD + 12;
  const mark = opens ? ' ⊕' : '';
  const room = Math.floor((r.h - 2 * PAD + 4) / LINE); // lines that fit vertically
  const probe = svgEl('text', { x, y, class: 'cell-name' });
  g.append(probe);
  const fits = (cls) => (str) => { probe.setAttribute('class', cls); probe.textContent = str; return probe.getComputedTextLength() <= maxW; };
  const nameLines = maxW >= 20 && room >= 2 ? wrapWords(name, fits('cell-name'), room - 1) : null;
  const amtFits = maxW >= 20 && room >= 1 && fits('cell-amt')(amount + mark);
  probe.remove();
  const line = (str, cls, k) => { const t = svgEl('text', { x, y: y + k * LINE, class: cls }); t.textContent = str; g.append(t); };
  if (nameLines && amtFits) {
    nameLines.forEach((l, k) => line(l, 'cell-name', k));
    line(amount + mark, 'cell-amt', nameLines.length);
    return true;
  }
  if (amtFits) { line(amount + mark, 'cell-amt', 0); return false; }
  // Too small for words: an opening box still shows its mark when there is room for it.
  if (opens && r.w >= 16 && r.h >= 16) {
    const t = svgEl('text', { x: r.x + r.w / 2, y: r.y + r.h / 2 + 4, class: 'cell-amt', 'text-anchor': 'middle' });
    t.textContent = '⊕';
    g.append(t);
  }
  return false;
}

// One shared hover tooltip for boxes too small to show their whole name. Pointer only: keyboard and screen-reader
// users already get the full name from the box's aria-label and the panel.
let tipEl = null;
function hoverTip(g, title, amount) {
  const show = (e) => {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'map-tip'; tipEl.setAttribute('aria-hidden', 'true'); document.body.append(tipEl); }
    tipEl.replaceChildren();
    const b = document.createElement('b');
    b.textContent = title;
    tipEl.append(b, document.createElement('br'), amount);
    tipEl.hidden = false;
    const pad = 14;
    const w = tipEl.offsetWidth;
    const left = Math.min(e.pageX + pad, window.scrollX + document.documentElement.clientWidth - w - 8);
    tipEl.style.left = `${Math.max(window.scrollX + 8, left)}px`;
    tipEl.style.top = `${e.pageY + pad}px`;
  };
  g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(e); });
  g.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(e); });
  g.addEventListener('pointerleave', () => { if (tipEl) tipEl.hidden = true; });
}

const press = (fn) => (e) => {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); fn(); }
};

const ringRect = (cls, r, inset) => {
  const i = Math.min(inset, r.w / 3, r.h / 3);
  return svgEl('rect', { class: cls, x: r.x + i, y: r.y + i, width: Math.max(r.w - 2 * i, 0.1), height: Math.max(r.h - 2 * i, 0.1) });
};

// Selected state: two 2px rings inside the box, --surface then --text. On every fill one of the two clears 3:1 in
// both themes (WCAG 1.4.11), so the state never rests on a single colour against an unknown fill.
function selectionRings(g, r) {
  g.append(ringRect('sel-a', r, 1), ringRect('sel-b', r, 3));
}

// Keyboard focus: one overlay per SVG, drawn outside the focused box (inner 2px --surface hugging the fill, outer
// 2px --text on the page background), so it never covers the label, shows on tiny boxes, and reads apart from the
// selection rings. Only for :focus-visible, so a tap or click draws nothing.
function focusOverlay(svg) {
  const o = svgEl('g', { class: 'focus-ring', 'aria-hidden': 'true', display: 'none' });
  const inner = svgEl('rect', { class: 'fr-inner' });
  const outer = svgEl('rect', { class: 'fr-outer' });
  o.append(inner, outer);
  svg.append(o);
  return (g, r) => {
    g.addEventListener('focus', () => {
      if (!g.matches(':focus-visible')) return;
      for (const [rect, d] of [[inner, 1], [outer, 3]]) {
        rect.setAttribute('x', r.x - d); rect.setAttribute('y', r.y - d);
        rect.setAttribute('width', r.w + 2 * d); rect.setAttribute('height', r.h + 2 * d);
      }
      svg.append(o); // keep it above every box
      o.removeAttribute('display');
    });
    g.addEventListener('blur', () => o.setAttribute('display', 'none'));
  };
}

// The pots bar plus its legend. colors = {cat: [hex…], ink, paper}. onSelect(potId). Returns {select(potId)}.
export function renderPots(el, tree, state, colors, onSelect) {
  el.replaceChildren();
  const W = Math.max(280, Math.round(el.getBoundingClientRect().width || 320));
  const H = 56;
  const svg = svgEl('svg', { class: 'potbar', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': 'The five pots of the city budget' });
  el.append(svg);
  const segs = potSegments(tree);
  const wireFocus = focusOverlay(svg);
  for (const s of segs) {
    const x0 = s.slot === 0 ? 0 : s.x0 * W + 1;
    const x1 = s.slot === segs.length - 1 ? W : s.x1 * W - 1;
    const r = { x: x0, y: 0, w: Math.max(x1 - x0, 1), h: H };
    const fill = colors.cat[s.slot];
    const g = svgEl('g', { class: 'pot', role: 'button', tabindex: 0, 'aria-label': s.aria, 'aria-pressed': s.pot.id === state.pot, 'data-pot': s.pot.id });
    g.style.setProperty('--ink', inkOn(fill, colors.paper, colors.ink));
    g.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill, rx: 2 }));
    selectionRings(g, r);
    svg.insertBefore(g, svg.lastChild);
    if (!labelCell(g, r, s.pot.label, money(s.pot.value_m), false)) hoverTip(g, s.pot.label, money(s.pot.value_m));
    wireFocus(g, r);
    g.addEventListener('click', () => onSelect(s.pot.id));
    g.addEventListener('keydown', press(() => onSelect(s.pot.id)));
  }
  const legend = document.createElement('ul');
  legend.className = 'legend pot-legend';
  for (const s of segs) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = colors.cat[s.slot];
    li.append(sw, s.pot.label);
    legend.append(li);
  }
  el.append(legend);
  return {
    select(potId) {
      svg.querySelectorAll('.pot').forEach((g) => g.setAttribute('aria-pressed', String(g.dataset.pot === potId)));
    },
  };
}

// One map (el.dataset.side is "in" or "out"): heading, crumbs, header, treemap and its list twin.
// handlers = {onActivate(side, node, {from, slot}), onUp(side, depth)}. colors as for renderPots.
export function render(el, state, tree, colors, handlers) {
  const side = el.dataset.side;
  const path = state[side];
  const node = path[path.length - 1];
  const sel = state.selected?.side === side ? state.selected.node : null;
  const { nav, head, box, ul } = mapSlots(el, side);
  nav.replaceChildren();
  head.replaceChildren();
  ul.replaceChildren();
  for (const c of crumbs(path)) {
    if (c.depth) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = ' › ';
      nav.append(sep);
    }
    if (c.current) {
      const cur = document.createElement('span');
      cur.className = 'crumb-cur';
      cur.setAttribute('aria-current', 'location');
      cur.textContent = c.name;
      nav.append(cur);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'crumb';
      b.textContent = c.name;
      b.addEventListener('click', () => handlers.onUp(side, c.depth));
      nav.append(b);
    }
  }
  const hf = headerFigure(node, tree);
  head.append(hf.prefix);
  if (hf.source?.url) {
    head.append(fig(hf, hf.amount));
  } else {
    head.append(hf.amount);
  }

  const W = Math.max(240, Math.round(el.getBoundingClientRect().width || 320));
  const H = Math.round(Math.min(480, Math.max(240, W * 0.75)));
  const svg = svgEl('svg', { class: 'map', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': `${node.name}: map of ${kids(node).length} boxes` });
  box.replaceChildren(svg);
  const wireFocus = focusOverlay(svg);

  const cells = cellModels(node, tree);
  const rects = layout(cells.map((c) => c.node), 0, 0, W, H);
  cells.forEach((c, k) => {
    const r0 = rects[k];
    if (!(r0.w > 0 && r0.h > 0)) return;
    // 2px surface gap between boxes: inset each side by up to 1px, never to zero.
    const ix = Math.min(1, r0.w / 4);
    const iy = Math.min(1, r0.h / 4);
    const r = { x: r0.x + ix, y: r0.y + iy, w: r0.w - 2 * ix, h: r0.h - 2 * iy };
    const fill = colors.cat[c.slot % colors.cat.length];
    const g = svgEl('g', { class: 'cell', role: 'button', tabindex: 0, 'aria-label': c.aria, 'data-slot': c.slot, 'data-opens': c.opens });
    if (sel === c.node) g.setAttribute('aria-pressed', 'true');
    g.style.setProperty('--ink', inkOn(fill, colors.paper, colors.ink));
    g.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill, rx: Math.min(2, r.w / 4, r.h / 4) }));
    selectionRings(g, r);
    svg.insertBefore(g, svg.lastChild);
    if (!labelCell(g, r, c.node.name, money(c.node.value_m), c.opens)) hoverTip(g, c.node.name, money(c.node.value_m));
    wireFocus(g, r);
    const go = () => handlers.onActivate(side, c.node, { from: 'map', slot: c.slot });
    g.addEventListener('click', go);
    g.addEventListener('keydown', press(go));
  });

  // The list twin: every child, tiny ones included, with the same activation.
  const items = listModel(node);
  kids(node).forEach((child, slot) => {
    const it = items[slot];
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = colors.cat[slot % colors.cat.length];
    sw.setAttribute('aria-hidden', 'true');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'list-item';
    b.dataset.slot = slot;
    if (sel === child) b.setAttribute('aria-pressed', 'true');
    b.textContent = it.name;
    if (it.opens) {
      const m = document.createElement('span');
      m.className = 'opens';
      m.textContent = ' ⊕';
      m.setAttribute('aria-hidden', 'true');
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = ', opens further';
      b.append(m, sr);
    }
    b.addEventListener('click', () => handlers.onActivate(side, child, { from: 'list', slot }));
    const src = resolve(tree, child.src ?? null);
    const amt = document.createElement('span');
    amt.className = 'list-amt';
    if (src?.url) {
      amt.append(fig({ source: src }, money(it.value_m)));
    } else {
      amt.textContent = money(it.value_m);
    }
    li.append(sw, b, amt);
    ul.append(li);
  });
}

// A map column's parts, created once. Re-renders refill them and never touch other children of the column (on a
// phone the details panel sits between the map and its list), and the list keeps whatever open state the reader set.
function mapSlots(el, side) {
  if (el.bmSlots) return el.bmSlots;
  const h = document.createElement('h3');
  h.className = 'map-title';
  h.textContent = side === 'in' ? 'Money in' : 'Money out';
  const nav = document.createElement('p');
  nav.className = 'crumbs';
  const head = document.createElement('p');
  head.className = 'map-head';
  const box = document.createElement('div');
  box.className = 'map-box';
  const det = document.createElement('details');
  det.className = 'maplist';
  det.open = window.matchMedia('(max-width: 639.98px)').matches; // open by default on a phone
  const sum = document.createElement('summary');
  sum.textContent = 'This map as a list';
  const ul = document.createElement('ul');
  det.append(sum, ul);
  el.replaceChildren(h, nav, head, box, det);
  el.bmSlots = { nav, head, box, det, ul };
  return el.bmSlots;
}
