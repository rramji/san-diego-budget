// Section 2: "where your property-tax dollar goes", one horizontal 100-cent bar from the County Auditor's chart.
// prepare() is pure (importable in Node); render() draws plain SVG plus an HTML legend.
import { inkOn } from './budget-map.js';
import { OURS_PREFIX } from '../sources.js';

// The segment the section is about. Slices that share a `group` and sit next to each other become one segment
// (the County prints cities' share as two slices: regular property tax plus the in-lieu vehicle license fee).
export const HIGHLIGHT = 'Cities';

const r3 = (x) => Math.round(x * 1000) / 1000;
const n1 = (x) => x.toFixed(1);

export function prepare(pd) {
  const groups = [];
  for (const s of pd.slices) {
    const last = groups[groups.length - 1];
    if (s.group && last && last.key === s.group) last.parts.push(s);
    else groups.push({ key: s.group ?? s.label, parts: [s] });
  }
  let x = 0;
  const segments = groups.map(({ key, parts }) => {
    const cents = r3(parts.reduce((t, p) => t + p.cents.value, 0));
    const first = parts[0].cents.source;
    const figure = parts.length === 1 ? parts[0].cents : {
      value: cents,
      source: {
        doc: `${OURS_PREFIX}${parts.map((p) => `${n1(p.cents.value)} (${p.label})`).join(' + ')} = ${n1(cents)}, from ${first.doc}`,
        page: first.page,
        url: first.url,
      },
    };
    const seg = { label: key, x0: x, x1: r3(x + cents), cents, figure, highlight: key === HIGHLIGHT, parts: parts.length > 1 ? parts : null };
    x = seg.x1;
    return seg;
  });
  return { segments, total: x };
}

// "17.8¢"; a printed 0.0 is the County's "less than 0.1%".
export const centsText = (c) => (c === 0 ? 'under 0.1¢' : `${n1(c)}¢`);

// ---- DOM (browser only) ----
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const BAR_H = 24;
const GAP = 2; // surface gap between touching segments
const PAD = 5;

// colors: {hi, a, b, surface, light, dark}. figureSpan(fig, text) makes a sourced .figure element.
// title: an array of strings and Nodes (so its numbers can be sourced figures).
export function render(el, prep, colors, { figureSpan, caption, title: titleParts }) {
  const width = Math.max(240, Math.floor(el.getBoundingClientRect().width));
  const svg = svgEl('svg', { class: 'cents', width, height: BAR_H, viewBox: `0 0 ${width} ${BAR_H}`, role: 'img' });
  svg.setAttribute('aria-label', `Of each dollar of the basic 1% property tax in San Diego County: ${
    prep.segments.map((s) => `${s.label} ${centsText(s.cents)}`).join(', ')}.`);
  const clipId = `cents-clip-${Math.random().toString(36).slice(2, 8)}`;
  const clip = svgEl('clipPath', { id: clipId });
  clip.append(svgEl('rect', { x: 0, y: 0, width, height: BAR_H, rx: 4 }));
  const defs = svgEl('defs');
  defs.append(clip);
  svg.append(defs);
  const g = svgEl('g', { 'clip-path': `url(#${clipId})` });
  svg.append(g);
  const title = document.createElement('p');
  title.className = 'cents-title';
  title.append(...titleParts);
  el.replaceChildren(title, svg); // in the document before labels are measured (getComputedTextLength is 0 off-DOM)
  const sx = (c) => (c / prep.total) * width;
  let grayIdx = 0;
  const fills = new Map();
  for (const s of prep.segments) {
    const fill = s.highlight ? colors.hi : (grayIdx++ % 2 ? colors.b : colors.a);
    fills.set(s, fill);
    const x0 = sx(s.x0);
    const w = sx(s.x1) - x0 - (s.x1 < prep.total ? GAP : 0);
    if (w <= 0) continue;
    const seg = svgEl('g', { class: `cents-seg${s.highlight ? ' is-hi' : ''}` });
    const r = svgEl('rect', { x: x0, y: 0, width: w, height: BAR_H, fill });
    const t = svgEl('title');
    t.textContent = `${s.label}: ${centsText(s.cents)}`;
    seg.append(t, r);
    g.append(seg);
    const label = svgEl('text', { x: x0 + w / 2, y: BAR_H / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: inkOn(fill, colors.light, colors.dark) });
    label.textContent = centsText(s.cents);
    seg.append(label);
    if (label.getComputedTextLength() + 2 * PAD > w) label.remove();
  }

  const legend = document.createElement('ul');
  legend.className = 'cents-legend';
  for (const s of prep.segments) {
    const li = document.createElement('li');
    if (s.highlight) li.className = 'is-hi';
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = fills.get(s);
    const name = document.createElement('span');
    name.className = 'cl-name';
    name.textContent = s.label;
    const val = document.createElement('span');
    val.className = 'cl-val';
    val.append(figureSpan(s.figure, centsText(s.cents)));
    li.append(sw, name, val);
    if (s.parts) {
      const how = document.createElement('span');
      how.className = 'cl-parts';
      how.append(OURS_PREFIX);
      s.parts.forEach((p, i) => {
        if (i) how.append(' + ');
        how.append(figureSpan(p.cents, centsText(p.cents.value)), ` ${/VLF/.test(p.label) ? 'in place of car-registration fees' : 'regular share'}`);
      });
      li.append(how);
    }
    legend.append(li);
  }
  const cap = document.createElement('figcaption');
  cap.className = 'chart-cap';
  cap.textContent = caption;
  el.append(legend, cap);
}
