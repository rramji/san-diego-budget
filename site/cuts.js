// Chapter 2 dig-deeper tables: FY2027 reductions and what Council restored.
// Source spans use the shared .figure + data-src-* convention; app.js mounts the popover buttons.
import { money } from './format.js';

function srcData(el, src) {
  el.dataset.srcDoc = src.doc;
  el.dataset.srcPage = src.page ?? '';
  el.dataset.srcUrl = src.url;
}

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
  const res = cuts.restorations.map((r) => [r.item, r.status, amount(r.amount_m), srcSpan(r.source, 'Restored')]);
  el.replaceChildren(
    tableBlock('What the budget cut',
      'These reductions are the ones listed under \u201cCritical Reductions\u201d in the adopted budget, with the reasons taken from the Independent Budget Analyst\u2019s department reviews.',
      ['Item', 'Department', 'Amount', 'Reason', 'Source'], red),
    tableBlock('What Council restored',
      'These are the items that the May Revision and the Council\u2019s modifications added back, with the status of each.',
      ['Item', 'Status', 'Amount', 'Source'], res),
  );
}

