// Section 4: what piles up. The prepare*() functions are pure (importable in Node); the render*() functions build
// plain HTML bars (and one small SVG line) and need a browser. Colour roles: --restricted marks money in hand,
// --gap marks what is missing; the payer bar shows the General Fund in its section 1 pot colour against greys.
import { money } from '../format.js';

export const EVERYTHING_ELSE = 'Everything else';
const OURS = 'our arithmetic';

// ---- pure ----

// The reserve meter is drawn in the policy's own unit, a share of yearly General Fund operating income, so the
// FY2026 target and the FY2030 goal sit on one scale. `fill` is the dollar balance over the dollar target.
export function prepareReserve(r) {
  const goal = r.goal_pct.value;
  const at = (p) => (p / goal) * 100;
  const b = at(r.balance_pct.value);
  const t = at(r.target_pct.value);
  return {
    fill: r.balance_m.value / r.target_m.value,
    segments: [
      { key: 'balance', x0: 0, x1: b, pct: r.balance_pct, amount: r.balance_m },
      { key: 'short', x0: b, x1: t },
      { key: 'beyond', x0: t, x1: 100 },
    ],
    marks: [
      { key: 'target', x: t, figure: r.target_pct, amount: r.target_m },
      { key: 'goal', x: 100, figure: r.goal_pct, fy: r.goal_fy },
    ],
  };
}

// The n largest asset gaps, largest first, then one "Everything else" row (our arithmetic) holding the rest, so the
// rows always add up to the Outlook's total. Widths are a share of the largest row.
export function prepareAssets(byAsset, n = 8) {
  const sorted = [...byAsset].sort((a, b) => b.gap_m.value - a.gap_m.value || a.asset.localeCompare(b.asset));
  const rows = sorted.slice(0, n).map((a) => ({ asset: a.asset, value_m: a.gap_m.value, figure: a.gap_m, rest: false }));
  const others = sorted.slice(n);
  if (others.length) {
    const value = others.reduce((t, a) => t + a.gap_m.value, 0);
    const src = others[0].gap_m.source;
    const zero = others.filter((a) => a.gap_m.value === 0).map((a) => a.asset);
    rows.push({
      asset: EVERYTHING_ELSE,
      value_m: value,
      rest: true,
      count: others.length,
      zero,
      figure: {
        value,
        source: { doc: `${OURS}: the other ${others.length} asset types in the Outlook's tables add up to $${value.toFixed(1)}M, from ${src.doc.split(',')[0]}`, page: null, url: src.url },
      },
    });
  }
  const max = Math.max(...rows.map((r) => r.value_m));
  return rows.map((r) => ({ ...r, pct: max > 0 ? (r.value_m / max) * 100 : 0 }));
}

// Promised vs held on one scale (promised = 100), the shortfall as the stretch between them, and the payers as one
// stacked bar of shares (input order, which puts the General Fund first).
export function preparePension(p) {
  const L = p.liability_m.value;
  const heldPct = (p.assets_m.value / L) * 100;
  const total = p.payers.reduce((t, x) => t + x.amount_m.value, 0);
  let x = 0;
  const payers = p.payers.map((y) => {
    const share = y.amount_m.value / total;
    const row = { label: y.label, figure: y.amount_m, share, x0: x, x1: x + share };
    x += share;
    return row;
  });
  payers[payers.length - 1].x1 = 1;
  return {
    bars: [
      { key: 'promised', figure: p.liability_m, pct: 100 },
      { key: 'held', figure: p.assets_m, pct: heldPct },
    ],
    shortfall: { figure: p.shortfall_m, x0: heldPct, x1: 100 },
    payers,
    total,
  };
}

// Street condition (PCI, 0-100): two measured surveys, the city's projection from FY2027, and the goal as a reference.
export function preparePci(roads) {
  const pt = (year, f, label) => ({ year, value: f.value, figure: f, label });
  const measured = [pt(2016, roads.pci_2016, '2016'), pt(2023, roads.pci_2023, '2023')];
  const projected = [pt(2027, roads.pci_2027, 'FY2027'), pt(2036, roads.pci_2036, 'FY2036')];
  const vals = [...measured, ...projected].map((x) => x.value).concat(roads.goal_new.value);
  const lo = Math.floor((Math.min(...vals) - 3) / 5) * 5;
  const hi = Math.ceil((Math.max(...vals) + 3) / 5) * 5;
  return {
    measured,
    projected,
    goal: { value: roads.goal_new.value, was: roads.goal_old.value, figure: roads.goal_new, wasFigure: roads.goal_old },
    domain: [lo, hi],
    years: [2016, 2036],
  };
}

// ---- DOM (browser only) ----
export const m1 = (v) => `$${v.toFixed(1)}M`;
export const bn = (v) => `$${(v / 1000).toFixed(2)}B`;

function h(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids.filter((k) => k != null && k !== false));
  return e;
}
const bar = (cls, x0, x1) => {
  const s = h('span', cls);
  s.style.left = `${x0}%`;
  s.style.width = `${Math.max(0, x1 - x0)}%`;
  return s;
};

// fig(figure, text) makes a sourced figure (adds "(our arithmetic)" itself where needed).
export function renderReserve(el, prep, { fig }) {
  const [bal] = prep.segments;
  const [target, goal] = prep.marks;
  const track = h('div', 'meter-track',
    bar('meter-seg is-balance', bal.x0, bal.x1),
    bar('meter-seg is-short', prep.segments[1].x0, prep.segments[1].x1),
    bar('meter-seg is-beyond', prep.segments[2].x0, prep.segments[2].x1));
  const tick = (m, cls) => { const t = h('span', `meter-tick ${cls}`); t.style.left = `${m.x}%`; return t; };
  track.append(tick(target, 'is-target'), tick(goal, 'is-goal'));
  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', `Reserve at the end of FY2026: ${bal.pct.value}% of yearly General Fund income (${m1(bal.amount.value)}, unaudited). `
    + `FY2026 target: ${target.figure.value}% (${m1(target.amount.value)}); the stretch between the two is still to be saved. Policy goal: ${goal.figure.value}% by FY${goal.fy}.`);
  const above = h('div', 'meter-above');
  const tl = h('span', 'meter-label is-target', 'FY2026 target');
  tl.style.right = `${100 - target.x}%`;
  above.append(tl);
  const below = h('div', 'meter-below', h('span', 'meter-label is-goal', `Goal, FY${goal.fy}`));
  const key = h('ul', 'pile-key',
    h('li', null, h('span', 'swatch is-balance'), h('span', 'pk-name', 'Saved at the end of FY2026 (unaudited)'),
      h('span', 'pk-val', fig(bal.pct, `${bal.pct.value}%`), ' (', fig(bal.amount, m1(bal.amount.value)), ')')),
    h('li', 'is-gap-row', h('span', 'swatch is-short'), h('span', 'pk-name', 'Still to save to reach the FY2026 target'), h('span', 'pk-val')),
    h('li', 'is-target-row', h('span', 'swatch is-tick'), h('span', 'pk-name', 'FY2026 target'),
      h('span', 'pk-val', fig(target.figure, `${target.figure.value}%`), ' (', fig(target.amount, m1(target.amount.value)), ')')),
    h('li', null, h('span', 'swatch is-beyond'), h('span', 'pk-name', `The policy’s goal, by FY${goal.fy}`),
      h('span', 'pk-val', fig(goal.figure, `${goal.figure.value}%`))));
  el.replaceChildren(h('div', 'meter', above, track, below), key);
}

export function renderAssets(el, rows, { fig }) {
  const ul = h('ul', 'asset-bars');
  ul.setAttribute('aria-label', 'Unfunded need by type of asset, FY2027 to FY2031');
  for (const r of rows) {
    const b = h('span', 'ab-bar');
    b.style.width = `${r.pct}%`;
    ul.append(h('li', r.rest ? 'is-rest' : null,
      h('span', 'ab-name', r.asset),
      h('span', 'ab-val', fig(r.figure, money(r.value_m))),
      h('span', 'ab-track', b)));
  }
  el.replaceChildren(ul);
}

export function renderPensionBars(el, prep, { fig }) {
  const [promised, held] = prep.bars;
  const row = (name, f, ...segs) => h('div', 'pb-row', h('span', 'pb-name', name), h('span', 'pb-val', fig(f, bn(f.value))), h('span', 'pb-track', ...segs));
  const gapSeg = bar('pb-seg is-gap', prep.shortfall.x0, prep.shortfall.x1);
  const gapLabel = h('span', 'pb-gap-label', fig(prep.shortfall.figure, bn(prep.shortfall.figure.value)), ' short');
  const wrap = h('div', 'pension-bars',
    row('Promised: benefits earned so far', promised.figure, bar('pb-seg is-promised', 0, 100)),
    row('Held: what the fund has', held.figure, bar('pb-seg is-held', 0, held.pct), gapSeg),
    h('div', 'pb-gap', gapLabel));
  wrap.querySelector('.pb-gap').style.paddingLeft = `${prep.shortfall.x0}%`;
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', `Promised ${bn(promised.figure.value)}, held ${bn(held.figure.value)}, ${bn(prep.shortfall.figure.value)} short.`);
  el.replaceChildren(wrap);
}

// colors: one fill per payer (same order); shareFig: the printed General Fund share, shown on its segment.
export function renderPayers(el, prep, { fig, colors, ink, title, shareFig }) {
  const track = h('div', 'payer-bar');
  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', `${prep.payers.map((p) => `${p.label} ${m1(p.figure.value)}`).join(', ')}.`);
  prep.payers.forEach((p, i) => {
    const s = bar('payer-seg', p.x0 * 100, p.x1 * 100);
    s.style.background = colors[i];
    s.title = `${p.label}: ${m1(p.figure.value)}`;
    if (i === 0 && shareFig) { s.append(h('span', 'payer-in', `${Math.round(shareFig.value)}%`)); s.style.color = ink[0]; }
    track.append(s);
  });
  const key = h('ul', 'pile-key payer-key');
  prep.payers.forEach((p, i) => {
    const sw = h('span', 'swatch');
    sw.style.background = colors[i];
    key.append(h('li', i === 0 ? 'is-hi' : null, sw, h('span', 'pk-name', p.label), h('span', 'pk-val', fig(p.figure, m1(p.figure.value)))));
  });
  el.replaceChildren(h('p', 'pile-title', ...title), track, key);
}

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export function renderPci(el, prep) {
  const width = Math.max(260, Math.floor(el.getBoundingClientRect().width));
  const H = 168;
  const m = { l: 28, r: 18, t: 18, b: 28 };
  const x = (yr) => m.l + ((yr - prep.years[0]) / (prep.years[1] - prep.years[0])) * (width - m.l - m.r);
  const y = (v) => m.t + (1 - (v - prep.domain[0]) / (prep.domain[1] - prep.domain[0])) * (H - m.t - m.b);
  const all = [...prep.measured, ...prep.projected];
  const svg = svgEl('svg', { class: 'pci', width, height: H, viewBox: `0 0 ${width} ${H}`, role: 'img' });
  svg.setAttribute('aria-label', `Street condition score: ${all.map((p) => `${p.label} ${p.value}${p.year > 2023 ? ' (projected)' : ''}`).join(', ')}. Goal ${prep.goal.value}, lowered from ${prep.goal.was}.`);
  for (let v = Math.ceil(prep.domain[0] / 10) * 10; v <= prep.domain[1]; v += 10) {
    svg.append(svgEl('line', { class: 'pci-grid', x1: m.l, x2: width - m.r, y1: y(v), y2: y(v) }));
    const t = svgEl('text', { class: 'pci-tick', x: m.l - 6, y: y(v), 'text-anchor': 'end', 'dominant-baseline': 'central' });
    t.textContent = String(v);
    svg.append(t);
  }
  svg.append(svgEl('line', { class: 'pci-goal', x1: m.l, x2: width - m.r, y1: y(prep.goal.value), y2: y(prep.goal.value) }));
  const gl = svgEl('text', { class: 'pci-goal-label', x: width - m.r, y: y(prep.goal.value) - 6, 'text-anchor': 'end' });
  gl.textContent = `Goal ${prep.goal.value} (was ${prep.goal.was})`;
  svg.append(gl);
  const path = (pts, cls) => svgEl('path', { class: cls, d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.year)},${y(p.value)}`).join('') });
  svg.append(path(prep.measured, 'pci-line'), path(prep.projected, 'pci-line is-proj'));
  for (const p of all) {
    const g = svgEl('g', { class: `pci-pt${p.year > 2023 ? ' is-proj' : ''}` });
    const t = svgEl('title');
    t.textContent = `${p.label}: ${p.value}${p.year > 2023 ? ' (projected)' : ''}`;
    g.append(t, svgEl('circle', { cx: x(p.year), cy: y(p.value), r: 4.5 }));
    const v = svgEl('text', { class: 'pci-val', x: x(p.year), y: y(p.value) - 10, 'text-anchor': 'middle' });
    v.textContent = String(p.value);
    const yr = svgEl('text', { class: 'pci-year', x: x(p.year), y: H - 8, 'text-anchor': p.year === prep.years[0] ? 'start' : p.year === prep.years[1] ? 'end' : 'middle' });
    yr.textContent = p.label;
    g.append(v, yr);
    svg.append(g);
  }
  el.replaceChildren(svg);
}
