// Chapter 4 claim charts: grouped bars and a single-axis line. prepare() is pure; render() uses the global d3.
const fmtM = (x) => `$${Number(x.toFixed(x >= 10 ? 1 : 2))}M`;
const shortLabel = (l) => l.replace(/\/.*$/, '').replace(/ (Financing|Funds?)$/, '');
const SVGNS = 'http://www.w3.org/2000/svg';

export function prepare(chart) {
  if (chart.type === 'grouped_bar') {
    const seriesLabels = [];
    for (const g of chart.groups) for (const s of g.series) if (!seriesLabels.includes(s.label)) seriesLabels.push(s.label);
    const max = Math.max(...chart.groups.flatMap((g) => g.series.map((s) => s.amount_m)));
    const groups = chart.groups.map((g) => ({ label: g.label, series: g.series.map((s) => ({ ...s, idx: seriesLabels.indexOf(s.label) })) }));
    const zero = groups.flatMap((g) => g.series.filter((s) => s.amount_m === 0).map((s) => `${s.label} in ${g.label}`));
    const summary = `Grouped bar chart of FY${chart.fy} capital budget by funding source, in millions of dollars. ` +
      groups.map((g) => `${g.label}: ${g.series.map((s) => `${s.label} ${fmtM(s.amount_m)}`).join(', ')}`).join('. ') +
      (zero.length ? `. ${zero.join(', ')} is zero.` : '.');
    return { type: chart.type, fy: chart.fy, groups, seriesLabels, max, summary };
  }
  if (chart.type === 'line') {
    const points = chart.points.map((p) => ({ ...p }));
    const first = points[0], last = points[points.length - 1];
    const max = Math.max(...points.map((p) => p.amount_m));
    const summary = `Line chart of the Homelessness Strategies & Solutions General Fund budget in millions of dollars, FY${first.fy} to FY${last.fy}: ` +
      points.map((p) => `FY${p.fy} ${fmtM(p.amount_m)}`).join(', ') + '.';
    return { type: chart.type, points, max, summary };
  }
  throw new Error(`unknown claim chart type: ${chart.type}`);
}

function figSpan(source, text) {
  const s = document.createElement('span');
  s.className = 'figure';
  s.dataset.srcDoc = source.doc;
  s.dataset.srcPage = source.page ?? '';
  s.dataset.srcUrl = source.url;
  s.textContent = text;
  return s;
}

function tableFor(data, source) {
  const det = document.createElement('details');
  det.className = 'claim-table';
  const sum = document.createElement('summary');
  sum.textContent = 'Chart values as a table';
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', 'Chart values');
  const t = document.createElement('table');
  const head = document.createElement('tr');
  const th = (x) => { const e = document.createElement('th'); e.scope = 'col'; e.textContent = x; return e; };
  const td = (x) => { const e = document.createElement('td'); if (typeof x === 'string') e.textContent = x; else e.append(x); return e; };
  const cell = (m) => (source ? figSpan(source, fmtM(m)) : fmtM(m));
  if (data.type === 'grouped_bar') {
    head.append(th('Funding source'), ...data.groups.map((g) => th(g.label)));
    t.append(head);
    for (const label of data.seriesLabels) {
      const tr = document.createElement('tr');
      const rh = document.createElement('th'); rh.scope = 'row'; rh.textContent = label;
      tr.append(rh);
      for (const g of data.groups) {
        const s = g.series.find((x) => x.label === label);
        tr.append(td(s ? cell(s.amount_m) : 'n/a'));
      }
      t.append(tr);
    }
  } else {
    head.append(th('Fiscal year'), th('General Fund budget'), th('Share of General Fund spending'));
    t.append(head);
    for (const p of data.points) {
      const tr = document.createElement('tr');
      const rh = document.createElement('th'); rh.scope = 'row'; rh.textContent = `FY${p.fy}`;
      tr.append(rh, td(cell(p.amount_m)), td(`${Number(p.share_pct.toFixed(1))}%`));
      t.append(tr);
    }
  }
  wrap.append(t);
  det.append(sum, wrap);
  return det;
}

export function render(el, chart, colors, source = null) {
  const d3 = window.d3;
  const data = prepare(chart);
  el.replaceChildren();
  el.style.position = 'relative';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = Math.max(260, Math.round(el.getBoundingClientRect().width || el.parentElement.clientWidth));
  const H = data.type === 'line' ? 230 : 280;
  const m = { t: 14, r: 10, b: data.type === 'line' ? 28 : 52, l: 40 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const y = d3.scaleLinear().domain([0, data.max * 1.1]).nice().range([ih, 0]);

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  const showTip = (lines, cx, cy) => {
    tip.replaceChildren();
    lines.forEach((l, i) => { const e = document.createElement(i ? 'div' : 'strong'); e.textContent = l; tip.append(e); });
    tip.hidden = false;
    tip.style.left = `${Math.max(0, Math.min(cx - 110, W - 220))}px`;
    tip.style.top = `${cy + 14}px`;
  };

  const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', data.summary).style('display', 'block').style('max-width', '100%');
  const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);
  const font = (s) => s.style('font', '12px var(--font-ui)').attr('fill', colors.muted);

  g.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line')
    .attr('x1', 0).attr('x2', iw).attr('y1', (t) => y(t)).attr('y2', (t) => y(t)).attr('stroke', colors.muted).attr('stroke-opacity', 0.25);
  font(g.append('g').selectAll('text').data(y.ticks(4)).join('text')
    .attr('x', -6).attr('y', (t) => y(t)).attr('dy', '0.35em').attr('text-anchor', 'end').text((t) => `$${t}M`));
  g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', ih).attr('y2', ih).attr('stroke', colors.muted);

  const n = data.type === 'grouped_bar' ? data.seriesLabels.length : 1;
  // Theme-aware tints: keep the base hue and chroma, spread lightness by >= 25 points per theme (light text token => dark theme).
  const dark = d3.lab(colors.text).l > 50;
  const [lo, hi] = dark ? [38, 90] : [28, 80];
  const base = d3.hcl(colors.discretionary);
  const tintAt = (i) => (n > 1 ? d3.hcl(base.h, base.c, dark ? hi - ((hi - lo) * i) / (n - 1) : lo + ((hi - lo) * i) / (n - 1)).formatRgb() : colors.discretionary);
  const legend = document.createElement('ul');
  legend.className = 'legend';

  if (data.type === 'grouped_bar') {
    const x0 = d3.scaleBand().domain(data.groups.map((gr) => gr.label)).range([0, iw]).paddingInner(0.18).paddingOuter(0.1);
    const x1 = d3.scaleBand().domain(d3.range(n)).range([0, x0.bandwidth()]).padding(0.08);
    data.groups.forEach((gr) => {
      const gg = g.append('g').attr('transform', `translate(${x0(gr.label)},0)`);
      gr.series.forEach((s) => {
        const h = Math.max(s.amount_m === 0 ? 1.5 : 1, ih - y(s.amount_m));
        const bw = x1.bandwidth(), bx = x1(s.idx);
        const rect = gg.append('rect').attr('x', bx).attr('width', bw).attr('fill', tintAt(s.idx)).attr('rx', 2)
          .attr('data-zero', s.amount_m === 0 ? 'true' : null)
          .attr('y', reduced ? ih - h : ih).attr('height', reduced ? h : 0);
        if (!reduced) rect.transition().duration(450).attr('y', ih - h).attr('height', h);
        rect.append('title').text(`${s.label}: ${fmtM(s.amount_m)}`);
        const txt = `${shortLabel(s.label)} ${fmtM(s.amount_m)}`;
        const len = txt.length * 6.3 + 6;
        const inside = ih - h - len - 4 < 0 && h > len + 8;
        const fill = tintAt(s.idx);
        const ink = Math.abs(d3.lab(fill).l - d3.lab(colors.bg).l) > Math.abs(d3.lab(fill).l - d3.lab(colors.text).l) ? colors.bg : colors.text;
        gg.append('text').attr('class', 'bar-label').attr('transform', `translate(${bx + bw / 2 + 4},${inside ? ih - h + 6 : ih - h - 4}) rotate(-90)`)
          .attr('text-anchor', inside ? 'end' : 'start').attr('fill', inside ? ink : colors.text).style('font', '600 11px var(--font-ui)').text(txt);
        const hit = gg.append('rect').attr('x', bx).attr('width', bw).attr('y', 0).attr('height', ih).attr('fill', 'transparent');
        const tipAt = (ev) => { const r = el.getBoundingClientRect(); showTip([gr.label, `${s.label}: ${fmtM(s.amount_m)}`], ev.clientX - r.left, ev.clientY - r.top); };
        hit.on('pointerenter', tipAt).on('pointermove', tipAt).on('pointerleave', () => { tip.hidden = true; }).on('click', tipAt);
      });
      const words = gr.label.split(' ');
      const lines = [];
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).trim().length * 6.6 > x0.bandwidth() && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
      }
      lines.push(cur);
      const lab = font(gg.append('text').attr('text-anchor', 'middle').attr('x', x0.bandwidth() / 2).attr('y', ih + 16));
      lines.forEach((l, i) => lab.append('tspan').attr('x', x0.bandwidth() / 2).attr('dy', i ? '1.2em' : 0).text(l));
    });
    data.seriesLabels.forEach((lbl, i) => {
      const li = document.createElement('li');
      const sw = document.createElementNS(SVGNS, 'svg');
      sw.setAttribute('width', 14); sw.setAttribute('height', 14); sw.setAttribute('aria-hidden', 'true');
      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('width', 14); r.setAttribute('height', 14); r.setAttribute('rx', 2); r.setAttribute('fill', tintAt(i));
      sw.append(r);
      const isZero = data.groups.every((gr) => (gr.series.find((s) => s.label === lbl) || { amount_m: 0 }).amount_m === 0);
      li.append(sw, isZero ? `${lbl} ($0 in both)` : lbl);
      legend.append(li);
    });
  } else {
    const xs = d3.scalePoint().domain(data.points.map((p) => p.fy)).range([22, iw - 22]);
    font(g.append('g').selectAll('text').data(data.points).join('text')
      .attr('x', (p) => xs(p.fy)).attr('y', ih + 18).attr('text-anchor', 'middle').text((p) => `FY${p.fy}`));
    const line = d3.line().x((p) => xs(p.fy)).y((p) => y(p.amount_m));
    const path = g.append('path').attr('d', line(data.points)).attr('fill', 'none').attr('stroke', colors.discretionary).attr('stroke-width', 2);
    if (!reduced) {
      const len = path.node().getTotalLength();
      path.attr('stroke-dasharray', len).attr('stroke-dashoffset', len).transition().duration(600).attr('stroke-dashoffset', 0);
    }
    data.points.forEach((p) => {
      const cx = xs(p.fy), cy = y(p.amount_m);
      const lines = [`FY${p.fy}: ${fmtM(p.amount_m)}`, `${Number(p.share_pct.toFixed(1))}% of General Fund spending`];
      const dot = g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 4.5).attr('fill', colors.discretionary)
        .attr('stroke', colors.bg || 'transparent').attr('stroke-width', 2);
      dot.append('title').text(lines.join('; '));
      const at = () => showTip(lines, cx + m.l, cy + m.t);
      g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 14).attr('fill', 'transparent')
        .on('pointerenter', at).on('pointermove', at).on('pointerleave', () => { tip.hidden = true; }).on('click', at);
    });
    const li = document.createElement('li');
    li.textContent = 'Homelessness Strategies & Solutions, General Fund budget, $ millions';
    legend.append(li);
  }

  const cap = document.createElement('p');
  cap.className = 'chart-cap';
  cap.textContent = data.type === 'grouped_bar'
    ? `FY${data.fy} adopted capital budget by funding source, in millions of dollars. Hover or tap a bar for its value.`
    : 'Hover or tap a dot to see that year’s share of General Fund spending.';
  el.append(tip);
  const out = [legend, cap];
  out.push(tableFor(data, source));
  el.append(...out);
}

export default { prepare, render };
