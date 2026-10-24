// Chapter 2 dig-deeper tables: FY2027 reductions and what was recommended or added back.
// Source spans use the shared .figure + data-src-* convention; app.js mounts the popover buttons.
import { money } from './format.js';
import { srcData } from './sources.js';

function srcSpan(src, text) {
  const s = document.createElement('span');
  s.className = 'figure';
  srcData(s, src);
  s.textContent = text;
  return s;
}

function tableBlock(title, intro, heads, rows) {
  const frag = document.createDocumentFragment();
  const h = document.createElement('h3');
  h.className = 'table-h';
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'chart-cap';
  p.textContent = intro;
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', `${title} (scrolls sideways on narrow screens)`);
  const table = document.createElement('table');
  const tr = document.createElement('tr');
  for (const t of heads) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = t; tr.append(th); }
  table.createTHead().append(tr);
  const body = table.createTBody();
  for (const cells of rows) {
    const r = body.insertRow();
    cells.forEach((c, i) => {
      const td = i === 0 ? document.createElement('th') : document.createElement('td');
      if (i === 0) td.scope = 'row';
      td.append(...[].concat(c));
      r.append(td);
    });
  }
  wrap.append(table);
  frag.append(h, p, wrap);
  return frag;
}

// The source link names where the row came from ("May Revision", "IBA-recommended Council modification"), not a fixed label.
export const statusLabel = (status) => (status || 'Source').split(' (')[0].trim();

export function renderCuts(el, cuts) {
  const amount = (a) => (a ? srcSpan(a.source, money(a.value)) : 'not stated');
  const red = cuts.reductions.map((r) => [
    r.item,
    r.fund && r.fund !== 'General Fund' ? `${r.dept} (${r.fund})` : r.dept,
    amount(r.amount_m),
    r.reason,
    [srcSpan(r.source, 'Cut'), ' ', srcSpan(r.reason_source, 'Reason')],
  ]);
  const res = cuts.restorations.map((r) => [r.item, r.status, amount(r.amount_m), srcSpan(r.source, statusLabel(r.status))]);
  el.replaceChildren(
    tableBlock('What the budget cut',
      'These are the reductions listed under "Critical Reductions" in the adopted budget. The amounts are the proposed-budget figures from the review by the Council\'s independent budget analyst (the IBA), and some were later partly added back (see the next table). The reasons come from the IBA\'s department reviews.',
      ['Item', 'Department', 'Amount proposed', 'Reason', 'Source'], red),
    tableBlock('Recommended or added back',
      'Items that the Mayor\'s revised proposal (the May Revision) put back or that the IBA recommended the Council change, and one the Mayor commented on. Each row says which.',
      ['Item', 'Where it came from', 'Amount', 'Source'], res),
  );
}

