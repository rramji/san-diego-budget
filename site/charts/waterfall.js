// Section 3: how this year's gap was closed, as a vertical-bar step chart (waterfall).
// prepare() is pure (importable in Node); render() draws plain SVG plus an HTML step list that carries the sourced figures.

const KINDS = new Set(['start', 'up', 'down', 'subtotal', 'end']);
const TOL = 0.05;
const r3 = (x) => Math.round(x * 1000) / 1000;

// steps: gap_story.waterfall. Each bar spans y0..y1 on one money scale (y1 is where the running total stands after it).
export function prepare(steps) {
  let total = 0;
  const bars = steps.map((s, i) => {
    if (!KINDS.has(s.kind)) throw new Error(`waterfall step ${i}: unknown kind ${s.kind}`);
    const a = s.amount_m.value;
    let y0;
    let y1;
    if (s.kind === 'start') { y0 = 0; y1 = a; } else if (s.kind === 'up') { y0 = total; y1 = total + a; } else if (s.kind === 'down') { y0 = total; y1 = total - a; } else {
      if (Math.abs(a - total) > TOL) throw new Error(`waterfall step ${i} (${s.kind}): ${a} but the running total is ${r3(total)}`);
      y0 = 0; y1 = a;
    }
    total = y1;
    return {
      label: s.label, kind: s.kind, y0: r3(y0), y1: r3(y1), figure: s.amount_m,
      positions: s.positions ?? null, ourArithmetic: !!s.our_arithmetic,
    };
  });
  if (!bars.length || Math.abs(total) > TOL) throw new Error(`waterfall: the steps end at ${r3(total)}, not 0; they must close`);
  return { bars, max: Math.max(...bars.map((b) => Math.max(b.y0, b.y1))) };
}

const SIGN = { up: '+', down: '−' };
const amt = (v) => (v === 0 ? '0' : v.toFixed(1));
// Short value labels on the bars: "+28.2" when narrow, "+$28.2M" when there is room.
export function barValue(b, wide) {
  const v = b.figure.value;
  const body = wide ? (v === 0 ? '$0' : `$${amt(v)}M`) : amt(v);
  return `${SIGN[b.kind] ?? ''}${body}`;
}

// ---- DOM (browser only) ----
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  return e;
};
const BAR_MAX = 24;
const R = 4;

export const fillRole = (b) => (b.kind === 'up' ? 'gap' : b.kind === 'down' ? 'discretionary' : 'locked');

// Square at the baseline, 4px rounded at the data end (start and subtotal bars); floating steps get a small radius.
function barPath(x, top, w, h) {
  const r = Math.min(R, h / 2, w / 2);
  return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`;
}

// host: an empty element the plot fills (redrawn on resize). colors: themeColors().
// opts: {label(bar) -> string, describe(bar) -> string, ariaLabel}
export function render(host, prep, colors, opts) {
  const wrap = host;
  wrap.style.position = 'relative';
  const W = Math.max(280, Math.floor(host.getBoundingClientRect().width || 280));
  const wide = W >= 520;
  const H = wide ? 280 : 236;
  const m = { top: 22, right: 2, bottom: 26, left: 2 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const n = prep.bars.length;
  const band = iw / n;
  const bw = Math.min(BAR_MAX, band * 0.62);
  const sy = (v) => m.top + ih - (v / prep.max) * ih;
  const bx = (i) => m.left + i * band + (band - bw) / 2;

  const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel, class: 'wf-svg' });
  const pid = `wf-hatch-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svgEl('defs');
  const pat = svgEl('pattern', { id: pid, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  pat.append(svgEl('rect', { width: 6, height: 6, fill: colors.bg }), svgEl('line', { x1: 0, x2: 0, y1: 0, y2: 6, stroke: colors.discretionary, 'stroke-width': 3 }));
  defs.append(pat);
  svg.append(defs);

  // baseline
  svg.append(svgEl('line', { x1: m.left, x2: W - m.right, y1: sy(0) + 0.5, y2: sy(0) + 0.5, stroke: colors.muted, 'stroke-width': 1 }));

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  const showTip = (b, i, ev) => {
    const strong = document.createElement('strong');
    strong.textContent = `${barValue(b, true)}`;
    const name = document.createElement('div');
    name.textContent = opts.label(b);
    const how = document.createElement('div');
    how.className = 'tip-src';
    how.textContent = opts.describe(b);
    tip.replaceChildren(strong, name, how);
    tip.hidden = false;
    const left = Math.min(Math.max(0, bx(i) + bw / 2 - 110), W - 220);
    const er = wrap.getBoundingClientRect();
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, Math.min(H - 20, (ev ? ev.clientY - er.top : sy(Math.max(b.y0, b.y1))) + 14))}px`;
  };
  const hide = () => { tip.hidden = true; };

  prep.bars.forEach((b, i) => {
    const x = bx(i);
    const hi = Math.max(b.y0, b.y1);
    const lo = Math.min(b.y0, b.y1);
    const top = sy(hi);
    const h = Math.max(0, sy(lo) - top);
    const role = fillRole(b);
    const g = svgEl('g', { class: `wf-bar wf-${b.kind}${b.ourArithmetic ? ' is-ours' : ''}` });
    const grounded = b.kind === 'start' || b.kind === 'subtotal';
    if (b.kind === 'end') {
      g.append(svgEl('rect', { x, y: sy(0) - 2, width: bw, height: 3, fill: colors.locked }));
    } else if (grounded) {
      g.append(svgEl('path', { d: barPath(x, top, bw, h), fill: colors[role] }));
    } else {
      const fill = b.ourArithmetic ? `url(#${pid})` : colors[role];
      g.append(svgEl('rect', {
        x, y: top, width: bw, height: Math.max(h, 2), rx: 2, fill,
        stroke: b.ourArithmetic ? colors.discretionary : null, 'stroke-width': b.ourArithmetic ? 1.5 : null,
      }));
    }
    // connector: the running total carried to the next bar
    if (i < n - 1) {
      const ly = Math.round(sy(b.y1)) + 0.5;
      svg.append(svgEl('line', { x1: x + bw, x2: bx(i + 1), y1: ly, y2: ly, stroke: colors.muted, 'stroke-width': 1, 'stroke-opacity': 0.7 }));
    }
    // value label above every bar (a decrease's label sits at the level it starts from); a surface halo keeps it
    // legible where it meets the connector line
    const t = svgEl('text', {
      x: x + bw / 2, y: (b.kind === 'end' ? sy(0) - 2 : top) - 6, 'text-anchor': 'middle', class: 'wf-val', fill: colors.text,
      stroke: colors.bg, 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round',
    });
    t.textContent = barValue(b, wide);
    g.append(t);
    // step number under the baseline, matching the list below
    const num = svgEl('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle', class: 'wf-num', fill: colors.muted });
    num.textContent = String(i + 1);
    g.append(num);
    const hit = svgEl('rect', { x: m.left + i * band, y: 0, width: band, height: H, fill: 'transparent', class: 'hit' });
    const title = svgEl('title');
    title.textContent = `${i + 1}. ${opts.label(b)}: ${barValue(b, true)}`;
    hit.append(title);
    hit.addEventListener('pointerenter', (ev) => showTip(b, i, ev));
    hit.addEventListener('pointermove', (ev) => showTip(b, i, ev));
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('click', (ev) => showTip(b, i, ev));
    g.append(hit);
    svg.append(g);
  });
  wrap.replaceChildren(svg, tip);
}
