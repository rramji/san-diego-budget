// Chapter 2 funnel: four stacked bars sharing one x-scale.
// prepare() is pure (no DOM, no d3). render() uses the global d3.
import { money } from '../format.js';
import { figureSpan, fig, h, OURS_PREFIX } from '../sources.js';

export const DEBT_NOTE = 'it combines the adopted and proposed budgets';

export function prepare(headline, funnel) {
  const h = headline;
  const total = h.total_budget_m;
  const gfFig = h.general_fund_m;
  const fund = (label, f, kind, note = null) => ({ label, amount_m: f.value, kind, figure: f, note });
  const bar1 = [
    fund('General Fund', h.general_fund_m, 'general'),
    fund('Enterprise funds', h.enterprise_m, 'restricted'),
    fund('Special revenue funds', h.special_revenue_m, 'restricted'),
    fund('Internal service funds', h.internal_service_m, 'restricted'),
    fund('Capital project funds', h.capital_project_m, 'restricted'),
    fund('Capital improvements (CIP)', h.cip_m, 'restricted'),
  ];
  const bar2 = bar1.map((s) => ({ ...s, kind: s.kind === 'general' ? 'general' : 'locked' }));
  const b3 = funnel.bar3;
  const bar3 = [
    fund('Pension payment (ADC)', b3.pension_adc_m, 'locked'),
    // Our sum of an adopted-budget line and a proposed-budget line (funnel.json), so the legend says so.
    fund('Debt service', b3.debt_service_m, 'locked', DEBT_NOTE),
    fund('Everything else', b3.everything_else_m, 'discretionary'),
  ];
  const bar4 = funnel.bar4.map((d) => ({ label: d.dept, amount_m: d.amount_m.value, kind: 'discretionary', figure: d.amount_m }));
  const gap = { label: 'Gap', amount_m: funnel.gap_m.value, kind: 'gap', figure: funnel.gap_m };
  return {
    bars: [
      { id: 'total', total_m: total.value, totalFigure: total, segments: bar1 },
      { id: 'locked', total_m: total.value, totalFigure: total, segments: bar2 },
      { id: 'gf', total_m: gfFig.value, totalFigure: gfFig, segments: bar3 },
      { id: 'depts', total_m: gfFig.value, totalFigure: gfFig, segments: [...bar4, gap] },
    ],
    gapRatio: funnel.gap_m.value / b3.everything_else_m.value,
    figures: { total, gf: gfFig, gap: funnel.gap_m, cuttable: b3.everything_else_m },
  };
}

// A segment's amount: a sourced figure, plus the segment's note if any.
function amount(s) {
  if (!s.note) return fig(s.figure, money(s.amount_m));
  return h('span', null, figureSpan(s.figure, money(s.amount_m)), ` (${s.note})`);
}

// The gap as a share of everything-else spending, as our own sourced sum.
export function ratioFigure(data) {
  const f = data.figures;
  const pct = Math.round(data.gapRatio * 1000) / 10;
  return {
    value: data.gapRatio,
    source: {
      doc: `${OURS_PREFIX}${f.gap.value.toFixed(1)} (the gap, ${f.gap.source.doc}) ÷ ${f.cuttable.value.toFixed(1)} (General Fund spending other than the pension payment and debt service) = ${pct}%`,
      page: f.gap.source.page ?? null,
      url: f.gap.source.url,
    },
  };
}

// Fill {total} {gf} {gap} {cuttable} {ratio} placeholders in caption text with sourced .figure spans.
function captionNode(text, data, cls = 'chart-cap') {
  const p = document.createElement('p');
  p.className = cls;
  const f = data.figures;
  const map = {
    total: () => fig(f.total, money(f.total.value)),
    gf: () => fig(f.gf, money(f.gf.value)),
    gap: () => fig(f.gap, money(f.gap.value)),
    cuttable: () => fig(f.cuttable, money(f.cuttable.value)),
    ratio: () => fig(ratioFigure(data), `about ${Math.round(data.gapRatio * 100)}%`),
  };
  for (const part of String(text || '').split(/(\{[a-z]+\})/)) {
    const m = /^\{([a-z]+)\}$/.exec(part);
    if (m && map[m[1]]) p.append(map[m[1]]()); else if (part) p.append(part);
  }
  return p;
}

// Scrollytelling (wide screens): the four bars become one bar that changes as the reader scrolls past four steps.
export const STEP_TITLES = ['The whole budget', 'What can be spent on anything', 'What comes off the top', 'The departments, and the gap'];

// The segments the sticky bar shows at step i, keyed by label; `dim` marks the legally restricted funds at step 2.
export function stepSegments(data, i) {
  const bar = data.bars[i];
  return bar.segments.map((s) => ({ ...s, dim: bar.id === 'locked' && s.kind === 'locked' }));
}

// opts.onStep(i) runs after the scrolly draws a step (its legend is rebuilt each step, so footnotes are re-mounted).
export function render(el, data, colors, captions = [], opts = {}) {
  const wide = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
  return wide ? renderScrolly(el, data, colors, captions, opts) : renderStacked(el, data, colors, captions);
}

// Shared drawing rules: segment fills, the colour of a label on a fill, and one legend row per segment.
function fillRules(d3, colors) {
  const tints = (base, n, toward) => d3.range(n).map((i) => d3.interpolateRgb(base, toward)(n > 1 ? (i / (n - 1)) * 0.55 : 0));
  const fillFor = (bar, seg, i, n) => {
    if (seg.kind === 'gap') return colors.gap;
    if (seg.kind === 'general') return colors.discretionary;
    if (bar.id === 'depts') return tints(colors.discretionary, n - 1, colors.text)[i];
    if (bar.id === 'gf') return seg.kind === 'locked' ? tints(colors.locked, 2, colors.text)[i] : colors.discretionary;
    return tints(colors.restricted, n - 1, colors.text)[i - 1]; // bars 1-2 non-GF segments
  };
  const labelColor = (fill, dim) => (dim ? colors.text : (d3.lab(fill).l < 58 ? '#fff' : '#111'));
  return { fillFor, labelColor };
}

function legendFor(bar, fillFor) {
  const n = bar.segments.length;
  const legend = document.createElement(bar.id === 'locked' ? 'p' : 'ul');
  legend.className = 'legend';
  if (bar.id === 'locked') legend.textContent = 'Same funds as above. Faded = legally restricted.';
  else bar.segments.forEach((s, i) => {
    const li = document.createElement('li');
    const sw = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sw.setAttribute('width', 14); sw.setAttribute('height', 14); sw.setAttribute('aria-hidden', 'true');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', 14); r.setAttribute('height', 14); r.setAttribute('fill', fillFor(bar, s, i, n));
    sw.append(r);
    // Name and amount in one span, so a long amount note wraps as text instead of squeezing the name.
    li.append(sw, h('span', null, `${s.kind === 'gap' ? 'Gap' : s.label} `, amount(s)));
    legend.append(li);
  });
  return legend;
}

function tipFor(host, W) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  const show = (b, s, ev) => {
    tip.replaceChildren();
    const t = document.createElement('strong');
    t.textContent = s.kind === 'gap' ? `${money(s.amount_m)} gap` : `${s.label}: ${money(s.amount_m)}`;
    tip.append(t);
    if (s.kind !== 'gap') {
      const d = document.createElement('div');
      d.textContent = `${((s.amount_m / b.total_m) * 100).toFixed(1)}% of ${b.id === 'total' || b.id === 'locked' ? 'the whole budget' : 'the General Fund'}`;
      tip.append(d);
    }
    tip.hidden = false;
    const er = host.getBoundingClientRect();
    tip.style.left = `${Math.max(0, Math.min(ev.clientX - er.left - 110, W - 220))}px`;
    tip.style.top = `${ev.clientY - er.top + 14}px`;
  };
  return { tip, show, hide: () => { tip.hidden = true; } };
}

function summariesFor(data) {
  return {
    total: `Stacked bar of the whole budget, ${money(data.bars[0].total_m)}, split by fund type.`,
    locked: `The same bar with every fund except the General Fund faded, because that money is legally restricted.`,
    gf: `Stacked bar of the General Fund, ${money(data.bars[2].total_m)}: pension payment, debt service, and everything else.`,
    depts: `The General Fund by department at the same scale, with the ${money(data.figures.gap.value)} gap drawn beside it, about ${Math.round(data.gapRatio * 100)} percent of the ${money(data.figures.cuttable.value)} that is not a pension or debt payment.`,
  };
}

const sumOf = (b) => b.segments.filter((s) => s.kind !== 'gap').reduce((a, s) => a + s.amount_m, 0);
const GUT = 2, GAPSEP = 6, LABEL_MIN = 40;
const est = (t) => t.length * 7.2 + 12; // label width at 12px, roughly

function renderScrolly(el, data, colors, captions, opts) {
  const d3 = window.d3;
  if (el._io) el._io.disconnect();
  el.replaceChildren();
  el.classList.add('scrolly');
  el.style.position = '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = reduced ? 0 : 650;
  const { fillFor, labelColor } = fillRules(d3, colors);
  const summaries = summariesFor(data);

  const steps = document.createElement('div');
  steps.className = 'scrolly-steps';
  data.bars.forEach((bar, i) => {
    const step = document.createElement('div');
    step.className = 'step';
    step.dataset.step = i;
    step.append(h('p', 'step-n', `${i + 1} of ${data.bars.length}`), captionNode(captions[i], data, 'step-text'));
    steps.append(step);
  });
  const stage = document.createElement('div');
  stage.className = 'scrolly-stage'; // positioned in CSS (sticky on wide screens), so the tip can anchor to it
  el.append(steps, stage);

  const W = Math.max(280, Math.round(stage.getBoundingClientRect().width || el.getBoundingClientRect().width * 0.55));
  const H = 56;
  const maxM = d3.max(data.bars, (b) => sumOf(b) + b.segments.filter((s) => s.kind === 'gap').reduce((a, s) => a + s.amount_m, 0));
  const x = d3.scaleLinear().domain([0, maxM]).range([0, W - GAPSEP]);

  const title = h('p', 'stage-title');
  const svg = d3.select(stage).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').style('display', 'block').style('max-width', '100%');
  const legendHost = document.createElement('div');
  stage.prepend(title);
  stage.append(legendHost);
  const { tip, show, hide } = tipFor(stage, W);
  stage.append(tip);

  // Segment geometry at a step, on the shared scale.
  const layout = (i) => {
    const bar = data.bars[i];
    const n = bar.segments.length;
    let acc = 0;
    return stepSegments(data, i).map((s, j) => {
      const isGap = s.kind === 'gap';
      const x0 = isGap ? x(acc) + GAPSEP : x(acc);
      const w = Math.max(1, x(s.amount_m) - (isGap ? 0 : GUT));
      if (!isGap) acc += s.amount_m;
      const fill = fillFor(bar, s, j, n);
      const label = isGap ? `${money(s.amount_m)} gap`
        : w < LABEL_MIN ? null : est(s.label) <= w ? s.label : est(money(s.amount_m)) <= w ? money(s.amount_m) : null;
      return { ...s, x0, w, fill, label, bar };
    });
  };

  let current = -1;
  const setStep = (i) => {
    if (i === current) return;
    current = i;
    const bar = data.bars[i];
    const segs = layout(i);
    title.replaceChildren(h('span', 'stage-n', `${i + 1}`), STEP_TITLES[i]);
    svg.attr('aria-label', summaries[bar.id]);
    legendHost.replaceChildren(legendFor(bar, fillFor));
    for (const s of steps.children) s.classList.toggle('is-active', +s.dataset.step === i);

    const g = svg.selectAll('g.seg').data(segs, (d) => d.label === null ? d.bar.id + d.kind + d.x0 : d.label || d.kind);
    const enter = g.enter().append('g').attr('class', 'seg').attr('data-kind', (d) => d.kind).style('opacity', 0);
    enter.append('rect').attr('class', 'fill').attr('y', 0).attr('height', H).attr('rx', 2)
      .attr('x', (d) => d.x0).attr('width', (d) => d.w).attr('fill', (d) => d.fill).attr('fill-opacity', (d) => (d.dim ? 0.35 : 1));
    enter.append('text').attr('class', 'seg-label').attr('y', H / 2).attr('dy', '0.35em').style('font', '600 12px var(--font-ui)');
    enter.append('rect').attr('class', 'hit').attr('y', 0).attr('height', H).attr('fill', 'transparent')
      .on('pointerenter', (ev, d) => show(d.bar, d, ev)).on('pointermove', (ev, d) => show(d.bar, d, ev))
      .on('pointerleave', hide).on('click', (ev, d) => show(d.bar, d, ev));
    g.exit().transition().duration(DUR).style('opacity', 0).remove();
    const all = enter.merge(g);
    all.transition().duration(DUR).style('opacity', 1);
    all.select('rect.fill').transition().duration(DUR)
      .attr('x', (d) => d.x0).attr('width', (d) => d.w).attr('fill', (d) => d.fill).attr('fill-opacity', (d) => (d.dim ? 0.35 : 1));
    all.select('rect.hit').attr('x', (d) => d.x0).attr('width', (d) => d.w);
    all.select('text')
      .attr('fill', (d) => (d.kind === 'gap' ? colors.text : labelColor(d.fill, d.dim)))
      .attr('text-anchor', (d) => (d.kind === 'gap' ? 'start' : 'middle'))
      .text((d) => d.label || '')
      .transition().duration(DUR).attr('x', (d) => (d.kind === 'gap' ? d.x0 + d.w + 6 : d.x0 + d.w / 2));
  };
  const draw = (i) => { if (i !== current) { setStep(i); if (opts.onStep) opts.onStep(i); } };
  draw(0);

  // The step crossing the middle band of the window is the current one.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) draw(+e.target.dataset.step);
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  for (const s of steps.children) io.observe(s);
  el._io = io;
  el.dataset.step = '0';
}

function renderStacked(el, data, colors, captions) {
  const d3 = window.d3;
  if (el._io) { el._io.disconnect(); el._io = null; }
  el.classList.remove('scrolly');
  el.replaceChildren();
  el.style.position = 'relative';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = Math.max(280, Math.round(el.getBoundingClientRect().width || el.parentElement.clientWidth));
  const H = 44;
  const maxM = d3.max(data.bars, (b) => sumOf(b) + b.segments.filter((s) => s.kind === 'gap').reduce((a, s) => a + s.amount_m, 0));
  const x = d3.scaleLinear().domain([0, maxM]).range([0, W - GAPSEP]); // one scale for all four bars
  const { fillFor, labelColor } = fillRules(d3, colors);
  const { tip, show: showTip, hide } = tipFor(el, W);
  const summaries = summariesFor(data);

  data.bars.forEach((bar, bi) => {
    const wrap = document.createElement('div');
    wrap.className = 'fbar';
    wrap.dataset.bar = bar.id;
    const svg = d3.select(wrap).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img')
      .attr('aria-label', bi === 0
        ? `${summaries.total} Four bars narrow it down: whole budget ${money(data.bars[0].total_m)}, General Fund ${money(data.bars[2].total_m)}, the part that is not pension or debt ${money(data.figures.cuttable.value)}, and the gap is about ${Math.round(data.gapRatio * 100)} percent of that.`
        : summaries[bar.id])
      .style('display', 'block').style('max-width', '100%');
    const n = bar.segments.length;
    let acc = 0;
    const labelsHidden = [];
    bar.segments.forEach((s, i) => {
      const isGap = s.kind === 'gap';
      const x0 = isGap ? x(acc) + GAPSEP : x(acc);
      const w = Math.max(1, x(s.amount_m) - (isGap ? 0 : GUT));
      const dim = bar.id === 'locked' && s.kind === 'locked';
      const fill = fillFor(bar, s, i, n);
      const g = svg.append('g').attr('class', 'seg').attr('data-kind', s.kind);
      const rect = g.append('rect').attr('x', x0).attr('y', 0).attr('height', H).attr('fill', fill)
        .attr('fill-opacity', dim ? 0.35 : 1).attr('rx', 2).attr('width', reduced ? w : 0);
      if (!reduced) rect.transition().duration(500).attr('width', w);
      rect.append('title').text(`${s.label}: ${money(s.amount_m)}`);
      g.append('rect').attr('x', x0).attr('y', 0).attr('width', w).attr('height', H).attr('fill', 'transparent')
        .on('pointerenter', (ev) => showTip(bar, s, ev)).on('pointermove', (ev) => showTip(bar, s, ev))
        .on('pointerleave', hide).on('click', (ev) => showTip(bar, s, ev));
      if (isGap) {
        g.append('text').attr('x', x0 + w + 6).attr('y', H / 2).attr('dy', '0.35em').attr('class', 'gap-label')
          .attr('fill', colors.text).style('font', '600 12px var(--font-ui)').text(`${money(s.amount_m)} gap`);
      } else if (w >= LABEL_MIN) {
        const txt = est(s.label) <= w ? s.label : (est(money(s.amount_m)) <= w ? money(s.amount_m) : null);
        if (txt) {
          g.append('text').attr('class', 'seg-label').attr('x', x0 + w / 2).attr('y', H / 2).attr('dy', '0.35em').attr('text-anchor', 'middle')
            .attr('fill', labelColor(fill, dim)).style('font', '600 12px var(--font-ui)').text(txt);
        } else labelsHidden.push(s.label);
      } else labelsHidden.push(s.label);
      if (!isGap) acc += s.amount_m;
    });
    wrap.dataset.hiddenLabels = labelsHidden.length;

    const legend = legendFor(bar, fillFor); // bar 2 repeats bar 1's segments, so it gets a one-line key
    wrap.append(legend);
    wrap.append(captionNode(captions[bi], data));
    el.append(wrap);
  });
  el.append(tip);
}

export default { prepare, render };
