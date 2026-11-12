// The pensions claim card's four pictures, drawn from claims.json `visual` (kind "pensions") as plain HTML bars, so
// every number on screen is a sourced .figure and the colours follow the site's tokens in both themes.
// prepare() is pure (importable in Node) and resolves every "{key}" token in the copy to a figure; render() builds DOM.
//
// Colour roles (site tokens): past = the shortfall built up in earlier years (--gap), now/city = the city and this
// year's benefits (--cat-1), employee = employees (--cat-2), other = context (--cents-a), out = benefits paid (outline).

const TOKEN = /\{(\w+)\}/g;

// A figure's text, by the convention in its key: _m money in millions (one decimal, as the budget prints),
// _bn billions (two decimals), _pct a share of pay (one decimal), _cents cents on the dollar (whole), else the number.
export function fmt(key, value) {
  if (key.endsWith('_m')) return `$${value.toFixed(1)}M`;
  if (key.endsWith('_bn')) return `$${value.toFixed(2)}B`;
  if (key.endsWith('_pct')) return `${value.toFixed(1)}%`;
  if (key.endsWith('_cents')) return `${Math.round(value)} cents`;
  return String(value);
}

// Copy with its tokens resolved: strings and {figure, key, text} parts. A token with no figure in scope throws, as
// the build checks the same thing.
export function tokenParts(text, scope) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    const f = scope[m[1]];
    if (!f) throw new Error(`pension card: no figure for {${m[1]}} in ${JSON.stringify(text)}`);
    out.push(text.slice(at, m.index), { key: m[1], figure: f, text: fmt(m[1], f.value) });
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return out.filter((x) => x !== '');
}

// Copy with named cites: each {text, source} becomes a {cite, text, source} part on its first appearance.
export function citeParts(text, cites = []) {
  const out = [];
  let rest = text;
  for (const c of cites) {
    const at = rest.indexOf(c.text);
    if (at < 0) throw new Error(`pension card: cite ${JSON.stringify(c.text)} not in ${JSON.stringify(text)}`);
    out.push(rest.slice(0, at), { cite: true, text: c.text, source: c.source });
    rest = rest.slice(at + c.text.length);
  }
  out.push(rest);
  return out.filter((x) => x !== '');
}

// Both: cites first, then tokens inside the plain stretches.
const copy = (text, scope, cites) => citeParts(text, cites).flatMap((p) => (typeof p === 'string' ? tokenParts(p, scope) : [p]));
const pctOf = (v, max) => (max > 0 ? Math.round((v / max) * 1000) / 10 : 0);

export function prepare(v) {
  if (!v || v.kind !== 'pensions') throw new Error('pension card: visual.kind must be "pensions"');
  const pay = v.payment;
  const payTotal = pay.parts.reduce((s, p) => s + p.amount_m.value, 0);
  const payment = {
    heading: copy(pay.heading, pay.figures),
    parts: pay.parts.map((p) => ({ role: p.role, label: p.label, legend: p.legend, figure: p.amount_m, text: fmt('_m', p.amount_m.value), width: pctOf(p.amount_m.value, payTotal) })),
    text: copy(pay.text, pay.figures),
    summary: `Of the ${fmt('_m', pay.figures.total_m.value)} payment: ${pay.parts.map((p) => `${p.label} ${fmt('_m', p.amount_m.value)}`).join(', ')}.`,
  };

  const who = v.who_pays;
  const rateMax = Math.max(...who.rates.map((r) => r.employee_pct.value + r.city_pct.value));
  const flowMax = Math.max(...who.flows.map((f) => f.amount_m.value));
  const whoPays = {
    heading: copy(who.heading, {}),
    ratesCaption: who.rates_caption,
    rates: who.rates.map((r) => {
      const total = r.employee_pct.value + r.city_pct.value;
      return {
        label: r.label, width: pctOf(total, rateMax),
        employee: { figure: r.employee_pct, text: fmt('_pct', r.employee_pct.value), width: pctOf(r.employee_pct.value, total) },
        city: { figure: r.city_pct, text: fmt('_pct', r.city_pct.value), width: pctOf(r.city_pct.value, total) },
      };
    }),
    flowsCaption: who.flows_caption,
    flows: who.flows.map((f) => ({ role: f.role, label: f.label, figure: f.amount_m, text: fmt('_m', f.amount_m.value), width: pctOf(f.amount_m.value, flowMax) })),
    text: copy(who.text, {}, who.cites),
  };

  const sh = v.shortfall;
  const years = sh.history.map((h) => h.year);
  const col = (y) => years.indexOf(y);
  const changeMax = Math.max(...sh.changes.map((c) => Math.abs(c.amount_bn.value)), Math.abs(sh.net_bn.value));
  const shortfall = {
    heading: copy(sh.heading, sh.figures),
    historyCaption: sh.history_caption,
    history: sh.history.map((h) => ({ year: h.year, now: !!h.now, figure: h.funded_pct, text: fmt('_pct', h.funded_pct.value), height: Math.min(100, h.funded_pct.value) })),
    episodes: sh.episodes.map((e) => {
      const a = col(e.from); const b = col(e.to);
      if (a < 0 || b < a) throw new Error(`pension card: episode ${e.from}–${e.to} is not on the history axis`);
      return { start: a + 1, span: b - a + 1, parts: e.source ? [{ cite: true, text: e.text, source: e.source }] : tokenParts(e.text, sh.figures) };
    }),
    changesCaption: sh.changes_caption,
    changes: sh.changes.map((c) => ({ label: c.label, figure: c.amount_bn, sign: c.amount_bn.value < 0 ? -1 : 1, text: `${c.amount_bn.value < 0 ? '−' : '+'}${fmt('_bn', Math.abs(c.amount_bn.value))}`, width: pctOf(Math.abs(c.amount_bn.value), changeMax) })),
    net: { label: sh.net_label, figure: sh.net_bn, sign: sh.net_bn.value < 0 ? -1 : 1, text: `${sh.net_bn.value < 0 ? '−' : '+'}${fmt('_bn', Math.abs(sh.net_bn.value))}`, width: pctOf(Math.abs(sh.net_bn.value), changeMax) },
    text: copy(sh.text, sh.figures, sh.cites),
  };

  const re = v.reform;
  const reform = {
    heading: copy(re.heading, {}),
    tiers: re.tiers.map((t) => t.label),
    rows: re.tier_rows.map(([key, label]) => {
      const max = Math.max(...re.tiers.map((t) => t[key].value));
      return { key, label, cells: re.tiers.map((t, i) => ({ figure: t[key], text: fmt(key, t[key].value), width: pctOf(t[key].value, max), role: key === 'ual_bn' ? 'past' : i === 0 ? 'other' : 'now' })) };
    }),
    note: re.tiers_note,
    timeline: re.timeline.map((t) => ({ when: t.when, role: t.role, parts: t.source ? [{ cite: true, text: t.text, source: t.source }] : tokenParts(t.text, t.figures || {}) })),
  };
  return { payment, whoPays, shortfall, reform };
}

// ---- DOM (browser only) ----
// opts: {figureSpan(fig, text) -> Node, cite(source, text) -> Node}
export function render(host, visual, opts) {
  const m = prepare(visual);
  const h = (tag, cls, ...kids) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.append(...kids.filter((k) => k != null && k !== false));
    return e;
  };
  const parts = (ps) => ps.map((p) => (typeof p === 'string' ? p : p.cite ? opts.cite(p.source, p.text) : opts.figureSpan(p.figure, p.text)));
  const bar = (role, width, ...kids) => { const e = h('div', `pc-bar pc-${role}`, ...kids); e.style.width = `${width}%`; return e; };
  const section = (n, heading, ...kids) => h('section', 'pc-sec', h('h4', 'pc-h', `${n}. `, ...parts(heading)), ...kids);
  const cap = (text) => h('p', 'pc-cap', text);

  // 1. Where the payment goes: one stacked bar, a legend with the sourced amounts, a sentence.
  const stack = h('div', 'pc-stack');
  stack.setAttribute('role', 'img');
  stack.setAttribute('aria-label', m.payment.summary);
  for (const p of m.payment.parts) {
    // The label fits only in a wide segment; the legend names every part.
    const seg = bar(p.role, p.width, p.width >= 40 ? h('span', 'pc-seg-label', p.label) : null, p.width >= 8 ? h('span', 'pc-seg-amt', p.text) : null);
    stack.append(seg);
  }
  const legend = h('ul', 'pc-legend', ...m.payment.parts.map((p) => h('li', null, h('span', `pc-swatch pc-${p.role}`), `${p.legend}, `, opts.figureSpan(p.figure, p.text))));
  const s1 = section(1, m.payment.heading, stack, legend, h('p', 'pc-text', ...parts(m.payment.text)));

  // 2. Who pays: two split bars (employee | city) and the FY2025 flows.
  const rates = h('div', 'pc-rows');
  for (const r of m.whoPays.rates) {
    const split = h('div', 'pc-split');
    split.style.width = `${r.width}%`;
    split.append(bar('employee', r.employee.width, h('span', 'pc-seg-label', 'Employees'), opts.figureSpan(r.employee.figure, r.employee.text)),
      bar('now', r.city.width, h('span', 'pc-seg-label', 'City'), opts.figureSpan(r.city.figure, r.city.text)));
    rates.append(h('div', 'pc-row-label', r.label), split);
  }
  const flows = h('div', 'pc-rows pc-rows-val');
  for (const f of m.whoPays.flows) {
    flows.append(h('div', `pc-row-label${f.role === 'out' ? ' pc-muted' : ''}`, f.label), h('div', 'pc-track', bar(f.role, f.width)),
      h('div', `pc-val${f.role === 'out' ? ' pc-muted' : ''}`, opts.figureSpan(f.figure, f.text)));
  }
  const s2 = section(2, m.whoPays.heading, cap(m.whoPays.ratesCaption), rates, cap(m.whoPays.flowsCaption), flows, h('p', 'pc-text', ...parts(m.whoPays.text)));

  // 3. The shortfall: funded-ratio columns with what happened between them, then what moved it since 2009.
  const hist = h('div', 'pc-hist');
  hist.style.setProperty('--pc-cols', String(m.shortfall.history.length));
  for (const y of m.shortfall.history) {
    const colEl = h('div', 'pc-col');
    colEl.style.height = `${y.height}%`;
    colEl.className = `pc-col pc-${y.now ? 'past' : 'context'}`;
    hist.append(h('div', 'pc-hist-col', h('span', 'pc-hist-val', opts.figureSpan(y.figure, y.text)), h('div', 'pc-col-box', colEl), h('span', 'pc-hist-year', String(y.year))));
  }
  const eps = h('div', 'pc-episodes');
  eps.style.setProperty('--pc-cols', String(m.shortfall.history.length));
  for (const e of m.shortfall.episodes) {
    const d = h('div', 'pc-episode', ...parts(e.parts));
    d.style.gridColumn = `${e.start} / span ${e.span}`;
    eps.append(d);
  }
  const changes = h('div', 'pc-changes');
  const changeRow = (c, strong) => {
    const row = h('div', `pc-change${strong ? ' pc-strong' : ''}`);
    const neg = h('div', 'pc-change-neg');
    const pos = h('div', 'pc-change-pos');
    const val = h('span', 'pc-val', opts.figureSpan(c.figure, c.text));
    if (c.sign < 0) { const b = bar('now', c.width); neg.append(val, b); } else { const b = bar('past', c.width); pos.append(b, val); }
    row.append(h('div', 'pc-row-label', c.label), h('div', 'pc-change-track', neg, pos));
    return row;
  };
  for (const c of m.shortfall.changes) changes.append(changeRow(c, false));
  changes.append(changeRow(m.shortfall.net, true));
  const s3 = section(3, m.shortfall.heading, cap(m.shortfall.historyCaption), hist, eps, cap(m.shortfall.changesCaption), changes, h('p', 'pc-text', ...parts(m.shortfall.text)));

  // 4. Reform: the two plan tiers side by side, then what happened to Proposition B and what the actuary projects.
  const tiers = h('div', 'pc-tiers');
  tiers.append(h('div'), ...m.reform.tiers.map((t) => h('div', 'pc-tier-h', t)));
  for (const r of m.reform.rows) {
    tiers.append(h('div', 'pc-row-label', r.label), ...r.cells.map((c) => h('div', 'pc-tier-cell', h('div', 'pc-track', bar(c.role, c.width)), h('span', 'pc-val', opts.figureSpan(c.figure, c.text)))));
  }
  const tl = h('ol', 'pc-timeline', ...m.reform.timeline.map((t) => h('li', `pc-tl pc-tl-${t.role}`, h('span', 'pc-tl-dot'), h('span', 'pc-tl-when', t.when), h('span', 'pc-tl-text', ...parts(t.parts)))));
  const s4 = section(4, m.reform.heading, tiers, cap(m.reform.note), tl);

  host.replaceChildren(s1, s2, s3, s4);
  return m;
}
