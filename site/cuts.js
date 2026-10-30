// Chapter 2 dig-deeper tables: FY2027 reductions and what was recommended or added back.
// Source spans use the shared .figure + data-src-* convention; app.js mounts the popover buttons.
import { money } from './format.js';
import { srcData, cite } from './sources.js';

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
  // On a phone each row stacks into a block, its cells labeled by their column (data-label, styles.css), so
  // nothing scrolls sideways. The explicit roles keep it a table for screen readers once CSS changes its display.
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap cut-table';
  const table = document.createElement('table');
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', title);
  const tr = document.createElement('tr');
  tr.setAttribute('role', 'row');
  for (const t of heads) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.setAttribute('role', 'columnheader');
    th.textContent = t;
    tr.append(th);
  }
  const head = table.createTHead();
  head.setAttribute('role', 'rowgroup');
  head.append(tr);
  const body = table.createTBody();
  body.setAttribute('role', 'rowgroup');
  for (const cells of rows) {
    const r = body.insertRow();
    r.setAttribute('role', 'row');
    cells.forEach((c, i) => {
      const td = i === 0 ? document.createElement('th') : document.createElement('td');
      if (i === 0) td.scope = 'row';
      td.setAttribute('role', i === 0 ? 'rowheader' : 'cell');
      td.dataset.label = heads[i];
      const v = document.createElement('span');
      v.className = 'cell-v';
      v.append(...[].concat(c));
      td.append(v);
      r.append(td);
    });
  }
  wrap.append(table);
  frag.append(h, p, wrap);
  return frag;
}

export function renderCuts(el, cuts) {
  const amount = (a) => (a ? srcSpan(a.source, money(a.value)) : 'not stated');
  // The row's source hangs off the item name and the reason's off the reason, rather than a column of "Cut / Reason".
  const red = cuts.reductions.map((r) => [
    cite(r.source, r.item),
    r.fund && r.fund !== 'General Fund' ? `${r.dept} (${r.fund})` : r.dept,
    amount(r.amount_m),
    cite(r.reason_source, r.reason),
  ]);
  const res = cuts.restorations.map((r) => [cite(r.source, r.item), r.status, amount(r.amount_m)]);
  el.replaceChildren(
    tableBlock('What the budget cut',
      'These are the reductions listed under "Critical Reductions" in the adopted budget. The amounts are the proposed-budget figures from the review by the Council\'s independent budget analyst (the IBA), and some were later partly added back (see the next table). The reasons come from the IBA\'s department reviews.',
      ['Item', 'Department', 'Amount proposed', 'Reason'], red),
    tableBlock('Recommended or added back',
      'Items that the Mayor\'s revised proposal (the May Revision) put back or that the IBA recommended the Council change, and one the Mayor commented on. Each row says which.',
      ['Item', 'Where it came from', 'Amount'], res),
  );
}

