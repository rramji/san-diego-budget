// Chapter 2 dig-deeper tables: FY2027 reductions and what Council restored.
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

export function renderCuts(el, cuts) {
  const amount = (a) => (a ? srcSpan(a.source, money(a.value)) : 'not stated');
  const red = cuts.reductions.map((r) => [
    r.item,
    r.fund && r.fund !== 'General Fund' ? `${r.dept} (${r.fund})` : r.dept,
    amount(r.amount_m),
    r.reason,
    [srcSpan(r.source, 'Cut'), ' ', srcSpan(r.reason_source, 'Reason')],
  ]);
  const res = cuts.restorations.map((r) => [r.item, r.status, amount(r.amount_m), srcSpan(r.source, 'Source')]);
  el.replaceChildren(
    tableBlock('What the budget cut',
      'These are the reductions listed under "Critical Reductions" in the adopted budget. The reasons come from the department reviews by the Independent Budget Analyst (IBA), the Council\'s own budget office.',
      ['Item', 'Department', 'Amount', 'Reason', 'Source'], red),
    tableBlock('What was added back',
      'Items that the Mayor\'s revised proposal (the May Revision) or the IBA\'s recommended Council changes put back, and one the Mayor commented on.',
      ['Item', 'Where it came from', 'Amount', 'Source'], res),
  );
}

