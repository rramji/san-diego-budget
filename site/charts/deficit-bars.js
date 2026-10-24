// Chapter 1 chart: structural deficit bars FY2012-FY2027 plus a dig-deeper stacked view.
// prepare() is pure (no DOM, no d3). render()/renderDig() use the global d3.
import { money } from '../format.js';

const val = (f) => (f ? f.value : null);
const firstSentence = (s) => {
  const m = /^.*?[.!?](?=\s|$)/.exec(s || '');
  return (m ? m[0] : s || '').trim();
};

export function prepare(input) {
  const rows = Array.isArray(input) ? input : input.years;
  const markers = Array.isArray(input) ? [] : (input.markers || []);
  const bars = rows.map((r) => {
    const reported = r.reported === true;
    const reserve = val(r.suspended_reserve_m);
    const resources = val(r.one_time_resources_m);
    let stack = null;
    if (reported) {
      if (r.components) {
        stack = { up: r.components.map((c) => ({ label: c.label, amount_m: c.amount_m, kind: c.label.startsWith('Suspended reserve') ? 'reserve' : 'resources' })), down: null };
      } else if (resources != null) {
        // Explicit data flag: true when the one-time resources figure already contains the suspended reserve.
        const inside = reserve != null && r.resources_include_reserve === true;
        const up = [{ label: 'One-time resources', amount_m: inside ? resources - reserve : resources, kind: 'resources' }];
        if (reserve) up.push({ label: 'Suspended reserve contribution', amount_m: reserve, kind: 'reserve' });
        const exp = val(r.one_time_expenditures_m);
        stack = { up, down: exp != null ? { label: 'One-time expenditures (offset)', amount_m: exp } : null };
      }
    }
    return {
      fy: r.fy,
      reported,
      value_m: reported ? val(r.structural_deficit_m) : null,
      components: r.components || null,
      stack,
      gross: /gross/.test(r.basis),
      proposed_net: /^proposed budget; net/.test(r.basis),
      expense_m: r.gf_expenditure_adopted_m ?? null,
      share: reported && r.gf_expenditure_adopted_m ? val(r.structural_deficit_m) / r.gf_expenditure_adopted_m : null,
      basis: r.basis,
      includes_suspended_reserve: !!r.includes_suspended_reserve,
      note: r.note || '',
      summary: firstSentence(r.note),
      figure: reported ? r.structural_deficit_m : null,
    };
  });
  const scale = rows.filter((r) => r.gf_expenditure_adopted_m != null).map((r) => ({ fy: r.fy, expense_m: r.gf_expenditure_adopted_m }));
  const vals = bars.filter((b) => b.reported && b.value_m != null);
  const peak = vals.reduce((a, b) => (a == null || b.value_m > a.value_m ? b : a), null);
  const stats = {
    mean_m: vals.length ? vals.reduce((a, b) => a + b.value_m, 0) / vals.length : null,
    max_m: peak ? peak.value_m : null,
    peak_fy: peak ? peak.fy : null,
    unreported: bars.filter((b) => !b.reported).length,
    peak_share: peak ? peak.share : null,
    peak_expense_m: peak ? peak.expense_m : null,
  };
  return { bars, scale, markers: markers.map((m) => ({ fy: m.fy, label: m.label, source: m.source || null })), stats };
}

const NS = 'http://www.w3.org/2000/svg';
const yy = (fy) => `’${String(fy).slice(2)}`;

function srcAttrs(el, fig) {
  el.className = 'figure';
  el.dataset.srcDoc = fig.source.doc;
  el.dataset.srcPage = fig.source.page ?? '';
  el.dataset.srcUrl = fig.source.url;
}

function legendItem(host, swatchHtml, text) {
  const li = document.createElement('li');
  li.innerHTML = swatchHtml;
  li.append(text);
  host.append(li);
}

export function render(el, data, colors) {
  const d3 = window.d3;
  el.replaceChildren();
  el.style.position = 'relative';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = Math.max(280, Math.round(el.getBoundingClientRect().width || el.parentElement.clientWidth));
  const narrow = W < 520;
  const H = narrow ? 280 : 360;
  const m = { top: 26, right: 12, bottom: 30, left: narrow ? 40 : 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  // Legend (HTML, above the chart)
  const legend = document.createElement('ul');
  legend.className = 'legend';
  legendItem(legend, '<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill="var(--gap)"/></svg>', 'Net structural deficit (adopted budgets, FY2022\u201326)');
  legendItem(legend, '<svg width="14" height="14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" fill="var(--gap)" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="3 2"/></svg>', 'FY2027: from the proposed-budget review');
  legendItem(legend, '<svg width="14" height="14" aria-hidden="true"><rect x=".5" y=".5" width="13" height="13" fill="var(--gap)" fill-opacity=".38" stroke="var(--gap)"/></svg>', 'One-time money used (proposed budgets, FY2012\u201321)');
  legendItem(legend, '<svg width="14" height="14" aria-hidden="true"><rect x=".5" y=".5" width="13" height="13" fill="url(#hatch)" stroke="var(--muted)" stroke-dasharray="2 2"/></svg>', 'Not reported');
  const note27 = document.createElement('li');
  note27.className = 'legend-note';
  note27.append('FY2027: figure from the IBA\u2019s review of the proposed budget; the adopted budget\u2019s own residual is ');
  if (data.fy27_adopted) { const f = document.createElement('span'); srcAttrs(f, data.fy27_adopted); f.textContent = `$${data.fy27_adopted.value}M`; note27.append(f); }
  note27.append('.');
  legend.append(note27);
  el.append(legend);

  const svg = d3.select(el).append('svg')
    .attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img')
    .attr('aria-label', `Bar chart of the General Fund structural deficit, FY2012 to FY2027. The largest was ${money(data.stats.max_m)} in FY${data.stats.peak_fy}. ${data.stats.unreported} years were not reported and are shown hatched.`)
    .style('display', 'block').style('max-width', '100%').style('overflow', 'visible');

  const defs = svg.append('defs');
  const pat = defs.append('pattern').attr('id', 'hatch').attr('width', 6).attr('height', 6)
    .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
  pat.append('rect').attr('width', 6).attr('height', 6).attr('fill', 'var(--surface)');
  pat.append('line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 6).attr('stroke', colors.muted).attr('stroke-width', 2);

  const fys = d3.range(2011, 2029);
  const x = d3.scaleBand().domain(fys).range([0, iw]).paddingInner(0.18).paddingOuter(0.05);
  const y = d3.scaleLinear().domain([0, Math.ceil(data.stats.max_m / 50) * 50]).range([ih, 0]);
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
  const cx = (fy) => x(fy) + x.bandwidth() / 2;

  // gridlines + left axis
  const ticks = y.ticks(4);
  g.selectAll('.grid').data(ticks).join('line')
    .attr('x1', 0).attr('x2', iw).attr('y1', (t) => y(t)).attr('y2', (t) => y(t))
    .attr('stroke', 'var(--rule)').attr('stroke-width', 1);
  g.selectAll('.ytick').data(ticks).join('text')
    .attr('x', -6).attr('y', (t) => y(t)).attr('dy', '0.32em').attr('text-anchor', 'end')
    .attr('fill', colors.muted).style('font', '11px var(--font-ui)')
    .text((t) => (t === 0 ? '$0' : `$${t}M`));
  // x labels, thinned when slots are narrow
  const step = x.bandwidth() < 22 ? 2 : 1;
  g.selectAll('.xl').data(fys.filter((fy) => (fy - 2012) % step === 0 && fy >= 2012 && fy <= 2027)).join('text')
    .attr('x', cx).attr('y', ih + 17).attr('text-anchor', 'middle')
    .attr('fill', colors.muted).style('font', '11px var(--font-ui)').text((fy) => (narrow ? yy(fy) : `FY${yy(fy)}`));
  g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', ih).attr('y2', ih).attr('stroke', colors.muted);

  // bars
  const bw = x.bandwidth();
  const r = Math.min(4, bw / 3);
  const topRound = (x0, y0, w, h) => (h <= 0 ? '' :
    `M${x0},${y0 + h}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + w - r}Q${x0 + w},${y0} ${x0 + w},${y0 + r}V${y0 + h}Z`);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  el.append(tip);
  const showTip = (b, ev) => {
    tip.replaceChildren();
    const h = document.createElement('strong');
    h.textContent = `FY${b.fy}: ${b.reported ? money(b.value_m) : 'not reported'}`;
    const p1 = document.createElement('div'); p1.textContent = b.basis.replace(/^./, (c) => c.toUpperCase()).split(';').slice(0, 2).join(';');
    const p2 = document.createElement('div'); p2.textContent = b.includes_suspended_reserve ? `${b.summary} (Includes a suspended reserve contribution.)` : b.summary;
    tip.append(h, p1);
    if (b.share != null) { const ps = document.createElement('div'); ps.textContent = `${(b.share * 100).toFixed(1)}% of General Fund spending`; tip.append(ps); }
    tip.append(p2);
    tip.hidden = false;
    const er = el.getBoundingClientRect();
    const left = Math.min(Math.max(0, cx(b.fy) + m.left - 110), W - 220);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, (ev ? ev.clientY - er.top : 60) + 14)}px`;
  };
  const hide = () => { tip.hidden = true; };

  for (const b of data.bars) {
    const x0 = x(b.fy);
    const gb = g.append('g');
    const title = b.reported
      ? `FY${b.fy}: ${money(b.value_m)}${b.share != null ? `, ${(b.share * 100).toFixed(1)}% of General Fund spending` : ''}. ${b.basis}. ${b.summary}${b.includes_suspended_reserve ? ' Includes a suspended reserve contribution.' : ''}`
      : `FY${b.fy}: not reported`;
    if (!b.reported) {
      gb.append('rect').attr('x', x0).attr('y', 0).attr('width', bw).attr('height', ih)
        .attr('fill', 'url(#hatch)').attr('stroke', colors.muted).attr('stroke-dasharray', '2 2');
    } else {
      const h = ih - y(b.value_m);
      if (h > 0) {
        gb.append('path').attr('d', topRound(x0, y(b.value_m), bw, h)).attr('fill', colors.gap)
          .attr('fill-opacity', b.gross ? 0.38 : 1).attr('stroke', b.gross ? colors.gap : b.proposed_net ? colors.text : 'none')
          .attr('stroke-width', b.proposed_net ? 1.5 : 1).attr('stroke-dasharray', b.proposed_net ? '3 2' : null);
      } else {
        gb.append('rect').attr('x', x0).attr('y', ih - 2).attr('width', bw).attr('height', 2).attr('fill', colors.gap);
      }
    }
    // full-height hit area (bigger than the mark) carrying the accessible title
    gb.append('rect').attr('x', x0 - 1).attr('y', 0).attr('width', bw + 2).attr('height', ih)
      .attr('fill', 'transparent').style('cursor', 'default').attr('class', 'hit')
      .on('pointerenter', (ev) => showTip(b, ev)).on('pointermove', (ev) => showTip(b, ev))
      .on('pointerleave', hide).on('click', (ev) => showTip(b, ev))
      .append('title').text(title);
    if (!reduced) gb.style('opacity', 1);
  }

  // value labels: all bars when there is room, else peak and latest only
  const roomy = bw >= 30;
  g.selectAll('.vl').data(data.bars.filter((b) => b.reported && (roomy || b.fy === data.stats.peak_fy || b.fy === 2027)))
    .join('text').attr('x', (b) => cx(b.fy)).attr('y', (b) => y(b.value_m) - 5).attr('text-anchor', 'middle')
    .attr('fill', colors.text).style('font', '600 11px var(--font-ui)').style('font-variant-numeric', 'tabular-nums')
    .text((b) => (b.value_m === 0 ? '$0' : money(b.value_m)));

  // markers
  const letters = 'ABCD';
  data.markers.forEach((mk, i) => {
    g.append('line').attr('x1', cx(mk.fy)).attr('x2', cx(mk.fy)).attr('y1', -8).attr('y2', ih)
      .attr('stroke', colors.text).attr('stroke-width', 1).attr('stroke-dasharray', '3 3').attr('stroke-opacity', 0.75);
    g.append('circle').attr('cx', cx(mk.fy)).attr('cy', -14).attr('r', 7).attr('fill', 'var(--surface)').attr('stroke', colors.text);
    g.append('text').attr('x', cx(mk.fy)).attr('y', -14).attr('dy', '0.35em').attr('text-anchor', 'middle')
      .attr('fill', colors.text).style('font', '700 10px var(--font-ui)').text(letters[i]);
  });
  const ol = document.createElement('ol');
  ol.className = 'marker-list';
  data.markers.forEach((mk, i) => {
    const li = document.createElement('li');
    li.dataset.letter = letters[i];
    const lab = document.createElement('span');
    lab.className = 'ml';
    lab.textContent = letters[i];
    li.append(lab);
    const t = document.createElement('span');
    t.textContent = `${mk.label} (FY${mk.fy})`;
    if (mk.source) srcAttrs(t, mk.source);
    li.append(t);
    ol.append(li);
  });
  el.append(ol);
  if (data.stats.peak_share != null) {
    const cap = document.createElement('p');
    cap.className = 'chart-cap';
    const pk = data.bars.find((b) => b.fy === data.stats.peak_fy);
    cap.append(`The FY${pk.fy} gap (`);
    const a = document.createElement('span'); srcAttrs(a, pk.figure); a.textContent = money(pk.value_m); cap.append(a);
    cap.append(`) was about ${Math.round(data.stats.peak_share * 100)}% of that year\u2019s General Fund spending (`);
    const b2 = document.createElement('span');
    srcAttrs(b2, { source: { doc: `City of San Diego open data, Operating Budget: General Fund adopted expenditure, FY${pk.fy}`, page: null, url: 'https://seshat.datasd.org/operating_budget/budget_operating_datasd.csv' } });
    b2.textContent = money(data.stats.peak_expense_m);
    cap.append(b2, ').');
    el.append(cap);
  }
}

// ---- Dig deeper: what filled the gap -------------------------------------------------
export function renderDig(el, data, colors) {
  const d3 = window.d3;
  el.replaceChildren();
  el.style.position = 'relative';
  const bars = data.bars.filter((b) => b.stack && (b.components || b.fy >= 2022));
  const W = Math.max(280, Math.round(el.getBoundingClientRect().width || 340));
  const narrow = W < 520;
  const H = narrow ? 260 : 320;
  const m = { top: 12, right: 8, bottom: 28, left: narrow ? 44 : 52 };
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
  const up = (b) => b.stack.up.reduce((a, c) => a + c.amount_m, 0);
  const hi = Math.ceil(d3.max(bars, up) / 50) * 50;
  const lo = -Math.ceil(d3.max(bars, (b) => (b.stack.down ? b.stack.down.amount_m : 0)) / 50) * 50;
  const y = d3.scaleLinear().domain([lo, hi]).range([ih, 0]);
  const x = d3.scaleBand().domain(bars.map((b) => b.fy)).range([0, iw]).padding(0.2);

  const legend = document.createElement('ul');
  legend.className = 'legend';
  legendItem(legend, '<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill="var(--discretionary)"/></svg>', 'One-time money used');
  legendItem(legend, '<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill="var(--locked)"/></svg>', 'Skipped reserve deposit');
  legendItem(legend, '<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill="var(--restricted)"/></svg>', 'One-time spending (nets it down)');
  el.append(legend);

  const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img')
    .attr('aria-label', 'Stacked bars of the one-time money used to balance each budget, with one-time spending shown below the line as an offset.')
    .style('display', 'block').style('max-width', '100%');
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
  const ticks = y.ticks(5);
  g.selectAll('.grid').data(ticks).join('line').attr('x1', 0).attr('x2', iw)
    .attr('y1', y).attr('y2', y).attr('stroke', (t) => (t === 0 ? colors.muted : 'var(--rule)'));
  g.selectAll('.yt').data(ticks).join('text').attr('x', -6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end')
    .attr('fill', colors.muted).style('font', '11px var(--font-ui)').text((t) => (t === 0 ? '$0' : `${t < 0 ? '−' : ''}$${Math.abs(t)}M`));
  const fill = { resources: colors.discretionary, reserve: colors.locked };
  for (const b of bars) {
    const bg = g.append('g');
    let acc = 0;
    for (const c of b.stack.up) {
      const y1 = y(acc + c.amount_m), y0 = y(acc);
      const seg = bg.append('rect').attr('x', x(b.fy)).attr('width', x.bandwidth())
        .attr('y', y1).attr('height', Math.max(0, y0 - y1 - 2)).attr('fill', fill[c.kind]);
      seg.append('title').text(`FY${b.fy} ${c.label}: ${money(c.amount_m)}`);
      acc += c.amount_m;
    }
    if (b.stack.down) {
      const y0 = y(0), y1 = y(-b.stack.down.amount_m);
      bg.append('rect').attr('x', x(b.fy)).attr('width', x.bandwidth()).attr('y', y0 + 2).attr('height', Math.max(0, y1 - y0 - 2))
        .attr('fill', colors.restricted).append('title').text(`FY${b.fy} ${b.stack.down.label}: ${money(b.stack.down.amount_m)}`);
    }
    g.append('text').attr('x', x(b.fy) + x.bandwidth() / 2).attr('y', ih + 18).attr('text-anchor', 'middle')
      .attr('fill', colors.muted).style('font', '11px var(--font-ui)').text(narrow ? yy(b.fy) : `FY${yy(b.fy)}`);
  }
}

// Year-by-year notes (the IBA's own words) under the dig-deeper chart.
export function renderNotes(el, data) {
  el.replaceChildren();
  for (const b of data.bars) {
    const dt = document.createElement('dt');
    dt.append(`FY${b.fy}: `);
    if (b.figure) {
      const s = document.createElement('span');
      srcAttrs(s, b.figure);
      s.textContent = b.value_m === 0 ? '$0' : money(b.value_m);
      dt.append(s);
    } else dt.append('not reported');
    const dd = document.createElement('dd');
    dd.textContent = b.note;
    el.append(dt, dd);
  }
}

export default { prepare, render, renderDig, renderNotes };
