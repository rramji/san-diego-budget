// Source attribution: figure spans, footnote popovers, and the end-of-page Sources list.

export function srcData(el, src) {
  el.dataset.srcDoc = src.doc;
  el.dataset.srcPage = src.page ?? '';
  el.dataset.srcUrl = src.url;
}

export function figureSpan(fig, text) {
  const s = document.createElement('span');
  s.className = 'figure';
  srcData(s, fig.source);
  s.textContent = text;
  return s;
}

// ---- Popovers ---------------------------------------------------------
let openPop = null;
let openBtn = null;

function closePop(returnFocus) {
  if (!openPop) return;
  openPop.remove();
  openBtn.setAttribute('aria-expanded', 'false');
  openBtn.removeAttribute('aria-controls');
  if (returnFocus) openBtn.focus();
  openPop = openBtn = null;
}

function openPopover(btn, el) {
  closePop(false);
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.id = 'popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Source');
  const doc = document.createElement('p');
  doc.className = 'pop-doc';
  doc.textContent = el.dataset.srcDoc;
  pop.append(doc);
  const page = el.dataset.srcPage;
  if (page && page !== 'null') {
    const p = document.createElement('p');
    p.className = 'pop-meta';
    p.textContent = `Page ${page}`;
    pop.append(p);
  }
  const a = document.createElement('a');
  a.href = el.dataset.srcUrl;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Open the document';
  pop.append(a);
  btn.after(pop);
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  const left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-controls', 'popover');
  openPop = pop;
  openBtn = btn;
}

let globalListeners = false;
export function mountPopovers(root = document) {
  if (!globalListeners) {
    globalListeners = true;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(true); });
    document.addEventListener('click', (e) => {
      if (openPop && !openPop.contains(e.target) && !e.target.closest('.fn')) closePop(false);
    });
  }
  let n = 0;
  root.querySelectorAll('[data-src-url]').forEach((el) => {
    if (el.nextElementSibling && el.nextElementSibling.classList.contains('fn')) return;
    n += 1;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fn';
    btn.textContent = '¹';
    btn.setAttribute('aria-expanded', 'false');
    const label = (el.textContent || '').trim();
    btn.setAttribute('aria-label', `Source for ${label || 'this figure'}`);
    btn.addEventListener('click', () => {
      if (openBtn === btn) closePop(false); else openPopover(btn, el);
    });
    el.after(btn);
  });
  return n;
}


// ---- Sources list ---------------------------------------------------------
// Every {doc, url} pair anywhere in the loaded data, plus every sourced element on the page.
export function collectSources(data, root) {
  const found = [];
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    if (typeof v.doc === 'string' && typeof v.url === 'string') found.push({ doc: v.doc, page: v.page ?? null, url: v.url });
    Object.values(v).forEach(walk);
  };
  walk(data);
  if (root) {
    root.querySelectorAll('[data-src-url]').forEach((el) => {
      const page = el.dataset.srcPage;
      found.push({ doc: el.dataset.srcDoc || '', page: page && page !== 'null' ? page : null, url: el.dataset.srcUrl });
    });
  }
  const byUrl = new Map();
  for (const s of found) {
    if (!s.url) continue;
    const e = byUrl.get(s.url) || { url: s.url, docs: new Set(), derived: new Set(), pages: new Set() };
    // Our own sums ("derived: …", "our arithmetic: …") cite a document but don't name it.
    if (OURS.test(s.doc)) e.derived.add(s.doc); else if (s.doc) e.docs.add(s.doc);
    if (s.page != null && s.page !== '') e.pages.add(String(s.page));
    byUrl.set(s.url, e);
  }
  return [...byUrl.values()]
    .map((e) => ({ url: e.url, title: TITLES[e.url] || docTitle([...e.docs], e.url, [...e.derived]), pages: compactPages([...e.pages]) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
}

// Documents whose name the cited descriptions don't carry whole (they cite parts, tables or rows, or only our sums).
// Titles as printed on each document. Any other URL is named by docTitle below.
const SD = 'https://www.sandiego.gov/sites/default/files/';
export const TITLES = {
  [`${SD}2026-04/iba-report-26-11-review-of-the-fiscal-year-2027-proposed-budget_0.pdf`]: 'IBA Report 26-11, Review of the FY 2027 Proposed Budget',
  [`${SD}2026-05/26-15-recommended-city-council-modifications-to-the-mayors-proposed-fy-2027-budget-and-review-of-the-may-revision.pdf`]:
    "IBA Report 26-15, Recommended City Council Modifications to the Mayor's Proposed FY 2027 Budget and Review of the May Revision",
  [`${SD}2025-12/25-36-review-of-the-mayor-s-fy-2027-2031-five-year-financial-outlook_2.pdf`]: "IBA Report 25-36, Review of the Mayor's FY 2027-2031 Five-Year Financial Outlook",
  [`${SD}2026-03/26-06-iba-review-of-the-mayor-s-fy-2027-2031-five-year-capital-infrastructure-planning-outlook.pdf`]:
    "IBA Report 26-06, Review of the Mayor's FY 2027-2031 Five-Year Capital Infrastructure Planning Outlook",
  [`${SD}12-10_iba_review_of_fiscal_year_2022_proposed_budget.pdf`]: 'IBA Report 21-10, Review of the FY 2022 Proposed Budget',
  [`${SD}17_16_review_of_the_fiscal_year_2018_proposed_budget_complete_report.pdf`]: 'IBA Report 17-16, Review of the FY 2018 Proposed Budget',
  [`${SD}iba_report_18-08_review_of_fy19_proposed_budget_complete_rpt.pdf`]: 'IBA Report 18-08, Review of the FY 2019 Proposed Budget',
  [`${SD}19_06_review_of_fy2020_proposed_budget.pdf`]: 'IBA Report 19-06, Review of the FY 2020 Proposed Budget',
  [`${SD}2026-08/fy27ab_v3.pdf`]: 'FY2027 Adopted Budget Vol. III, Capital Improvements Program',
  [`${SD}2025-08/fy26ab_v1executivesummary.pdf`]: 'FY2026 Adopted Budget Vol. I, Executive Summary',
  [`${SD}2026-02/fy-27-31-five-year-capital-infrastructure-planning-outlook.pdf`]: 'FY2027-2031 Five-Year Capital Infrastructure Planning Outlook (CIP Outlook)',
  'https://sandiego.gov/sites/default/files/2025-02/fy-26-30-five-year-capital-infrastructure-planning-outlook.pdf': 'FY2026-2030 Five-Year Capital Infrastructure Planning Outlook',
  [`${SD}2026-06/2026-06-08-reduced-trash-collection-fees-for-city-of-san-diego-customers-effective-july-1-2027.pdf`]:
    'City of San Diego press release, Reduced Trash Collection Fees for City of San Diego Customers Effective July 1, 2027 (June 8, 2026)',
  'https://sandiego.gov/sites/default/files/2024-08/measure-e-online-posting.pdf': 'Measure E (November 2024): Impartial Analysis, Ballot Title, and Summary',
  'https://www.sandiegocounty.gov/content/dam/sdc/auditor/trb2526/taxallocationchart.pdf': 'County of San Diego Auditor & Controller, 1% Property Tax Allocation of FY 2025-2026 Receivable',
  'https://seshat.datasd.org/operating_budget/budget_operating_datasd.csv': 'City of San Diego open data: operating budget CSV (budget_operating_datasd.csv)',
  'https://data.sandiego.gov/datasets/operating-budget/': 'City of San Diego open data: operating budget dataset',
  'https://data.sandiego.gov/datasets/cip-fy-budget/': 'City of San Diego open data: Capital Improvement Program budget by fiscal year (cip_budget.csv)',
  'https://www.cdtfa.ca.gov/taxes-and-fees/SalesTaxRates10-1-26.xlsx': 'California Department of Tax and Fee Administration (CDTFA), sales tax rates effective October 1, 2026',
};

// A document's name from the descriptions cited at one URL: the longest shared lead-in that ends
// at a natural break (comma, colon, parenthesis, page reference), else the one description, trimmed.
const BREAK = /^($|,|:| \(| p\.\d)/;
const norm = (d) => d.replace(/Vol\. I (?=[A-Z])/, 'Vol. I, ');
function trimOne(d) {
  let t = d.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\([^)]*\)/, '');
  const i = t.indexOf(': ');
  if (t.length > 90 && i > 0 && !/["'\u201c]/.test(t.slice(0, i + 3))) t = t.slice(0, i);
  return t.trim();
}
// Drop a trailing table or figure reference and anything cut off inside an open parenthesis.
function tidy(t) {
  const open = t.lastIndexOf('(');
  if (open > 0 && t.indexOf(')', open) < 0) t = t.slice(0, open);
  return t.replace(/,\s*(Table|Figure) \d+[^,]*$/, '').replace(/[\s,:]+$/, '');
}
const OURS = /^(derived|our arithmetic):/;
export function docTitle(docs, url, derived = []) {
  return tidy(rawTitle(docs.filter((d) => !OURS.test(d)), url, [...derived, ...docs.filter((d) => OURS.test(d))]));
}
function rawTitle(docs, url, derived) {
  if (!docs.length) {
    const m = derived.join(' ').match(/IBA Report \d+-\d+/);
    return m ? m[0] : url;
  }
  const ds = docs.map(norm);
  if (ds.length === 1) return trimOne(ds[0]);
  const p = ds.reduce((x, d) => { let i = 0; while (i < x.length && x[i] === d[i]) i += 1; return x.slice(0, i); });
  for (let i = p.length; i >= 8; i -= 1) {
    if (ds.every((d) => BREAK.test(d.slice(i)))) return p.slice(0, i).replace(/\s*\([^)]*\)$/, '').replace(/[\s,:]+$/, '');
  }
  return trimOne(ds.reduce((x, d) => (d.length < x.length ? d : x)));
}

// ['3','7','46','47','48'] -> 'pages 3, 7, 46-48'
export function compactPages(pages) {
  const nums = [...new Set(pages.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!nums.length) return '';
  const runs = [];
  for (const n of nums) {
    const r = runs[runs.length - 1];
    if (r && n === r[1] + 1) r[1] = n; else runs.push([n, n]);
  }
  const txt = runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
  return nums.length === 1 ? `page ${txt}` : `pages ${txt}`;
}

export function renderSources(el, data) {
  const list = collectSources(data, document);
  el.replaceChildren(...list.map((s) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = s.title;
    li.append(a);
    if (s.pages) { const m = document.createElement('span'); m.className = 'src-pages'; m.textContent = ` (${s.pages})`; li.append(m); }
    return li;
  }));
  return list.length;
}
