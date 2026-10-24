// Chapter 2 funnel: four stacked bars sharing one x-scale.
// prepare() is pure (no DOM, no d3). render() uses the global d3.
import { money } from '../format.js';

export function prepare(headline, funnel) {
  const h = headline;
  const total = h.total_budget_m;
  const gfFig = h.general_fund_m;
  const fund = (label, fig, kind) => ({ label, amount_m: fig.value, kind, figure: fig });
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
    fund('Debt service', b3.debt_service_m, 'locked'),
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

function srcAttrs(el, fig) {
  el.className = 'figure';
  el.dataset.srcDoc = fig.source.doc;
  el.dataset.srcPage = fig.source.page ?? '';
  el.dataset.srcUrl = fig.source.url;
}

function figSpan(fig, text) {
  const s = document.createElement('span');
  srcAttrs(s, fig);
  s.textContent = text;
  return s;
}

// Fill {total} {gf} {gap} {cuttable} {ratio} placeholders in caption text with sourced .figure spans.
function captionNode(text, data) {
  const p = document.createElement('p');
  p.className = 'chart-cap';
  const f = data.figures;
  const ratioFig = { source: { ...f.gap.source, doc: `derived: gap divided by everything-else General Fund spending (${f.gap.source.doc})` } };
  const map = {
    total: () => figSpan(f.total, money(f.total.value)),
    gf: () => figSpan(f.gf, money(f.gf.value)),
    gap: () => figSpan(f.gap, money(f.gap.value)),
    cuttable: () => figSpan(f.cuttable, money(f.cuttable.value)),
    ratio: () => figSpan(ratioFig, `about ${Math.round(data.gapRatio * 100)}%`),
  };
  for (const part of String(text || '').split(/(\{[a-z]+\})/)) {
    const m = /^\{([a-z]+)\}$/.exec(part);
    if (m && map[m[1]]) p.append(map[m[1]]()); else if (part) p.append(part);
  }
  return p;
}

export function render(el, data, colors, captions = []) {
  const d3 = window.d3;
  el.replaceChildren();
  el.style.position = 'relative';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = Math.max(280, Math.round(el.getBoundingClientRect().width || el.parentElement.clientWidth));
  const H = 44, GUT = 2, GAPSEP = 6;
  const sum = (b) => b.segments.filter((s) => s.kind !== 'gap').reduce((a, s) => a + s.amount_m, 0);
  const maxM = d3.max(data.bars, (b) => sum(b) + b.segments.filter((s) => s.kind === 'gap').reduce((a, s) => a + s.amount_m, 0));
  const x = d3.scaleLinear().domain([0, maxM]).range([0, W - GAPSEP]); // one scale for all four bars

  const tints = (base, n, toward) => d3.range(n).map((i) => d3.interpolateRgb(base, toward)(n > 1 ? (i / (n - 1)) * 0.55 : 0));
  const fillFor = (bar, seg, i, n) => {
    if (seg.kind === 'gap') return colors.gap;
    if (seg.kind === 'general') return colors.discretionary;
    if (bar.id === 'depts') return tints(colors.discretionary, n - 1, colors.text)[i];
    if (bar.id === 'gf') return seg.kind === 'locked' ? tints(colors.locked, 2, colors.text)[i] : colors.discretionary;
    return tints(colors.restricted, n - 1, colors.text)[i - 1]; // bars 1-2 non-GF segments
  };
  const labelColor = (fill, dim) => (dim ? colors.text : (d3.lab(fill).l < 58 ? '#fff' : '#111'));

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  const showTip = (b, s, ev) => {
    tip.replaceChildren();
    const h = document.createElement('strong');
    h.textContent = s.kind === 'gap' ? `${money(s.amount_m)} gap` : `${s.label}: ${money(s.amount_m)}`;
    tip.append(h);
    if (s.kind !== 'gap') {
      const d = document.createElement('div');
      d.textContent = `${((s.amount_m / b.total_m) * 100).toFixed(1)}% of ${b.id === 'total' || b.id === 'locked' ? 'the whole budget' : 'the General Fund'}`;
      tip.append(d);
    }
    tip.hidden = false;
    const er = el.getBoundingClientRect();
    tip.style.left = `${Math.max(0, Math.min(ev.clientX - er.left - 110, W - 220))}px`;
    tip.style.top = `${ev.clientY - er.top + 14}px`;
  };

  const summaries = {
    total: `Stacked bar of the whole budget, ${money(data.bars[0].total_m)}, split by fund type.`,
    locked: `The same bar with every fund except the General Fund faded, because that money is legally restricted.`,
    gf: `Stacked bar of the General Fund, ${money(data.bars[2].total_m)}: pension payment, debt service, and everything else.`,
    depts: `The General Fund by department at the same scale, with the ${money(data.figures.gap.value)} gap drawn beside it, about ${Math.round(data.gapRatio * 100)} percent of the ${money(data.figures.cuttable.value)} that is not a pension or debt payment.`,
  };

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
        .on('pointerleave', () => { tip.hidden = true; }).on('click', (ev) => showTip(bar, s, ev));
      if (isGap) {
        g.append('text').attr('x', x0 + w + 6).attr('y', H / 2).attr('dy', '0.35em').attr('class', 'gap-label')
          .attr('fill', colors.text).style('font', '600 12px var(--font-ui)').text(`${money(s.amount_m)} gap`);
      } else if (w >= 40) {
        const est = (t) => t.length * 7.2 + 12;
        const txt = est(s.label) <= w ? s.label : (est(money(s.amount_m)) <= w ? money(s.amount_m) : null);
        if (txt) {
          g.append('text').attr('class', 'seg-label').attr('x', x0 + w / 2).attr('y', H / 2).attr('dy', '0.35em').attr('text-anchor', 'middle')
            .attr('fill', labelColor(fill, dim)).style('font', '600 12px var(--font-ui)').text(txt);
        } else labelsHidden.push(s.label);
      } else labelsHidden.push(s.label);
      if (!isGap) acc += s.amount_m;
    });
    wrap.dataset.hiddenLabels = labelsHidden.length;

    // Bar 2 repeats bar 1's segments, so it gets a one-line key instead of a second legend.
    const legend = document.createElement(bar.id === 'locked' ? 'p' : 'ul');
    legend.className = 'legend';
    if (bar.id === 'locked') legend.textContent = 'Same funds as above. Faded = legally restricted.';
    else bar.segments.forEach((s, i) => {
      const li = document.createElement('li');
      const sw = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      sw.setAttribute('width', 14); sw.setAttribute('height', 14); sw.setAttribute('aria-hidden', 'true');
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('width', 14); r.setAttribute('height', 14); r.setAttribute('fill', fillFor(bar, s, i, n));
      if (bar.id === 'locked' && s.kind === 'locked') r.setAttribute('fill-opacity', 0.35);
      sw.append(r);
      li.append(sw, `${s.kind === 'gap' ? 'Gap' : s.label} `);
      li.append(figSpan(s.figure, money(s.amount_m)));
      legend.append(li);
    });
    wrap.append(legend);
    wrap.append(captionNode(captions[bi], data));
    el.append(wrap);
  });
  el.append(tip);
}

export default { prepare, render };
