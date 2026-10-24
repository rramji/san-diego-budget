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
    if (s.doc.startsWith('derived:')) e.derived.add(s.doc); else if (s.doc) e.docs.add(s.doc);
    if (s.page != null && s.page !== '') e.pages.add(String(s.page));
    byUrl.set(s.url, e);
  }
  return [...byUrl.values()]
    .map((e) => ({ url: e.url, title: docTitle([...e.docs], e.url, [...e.derived]), pages: compactPages([...e.pages]) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
}

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
export function docTitle(docs, url, derived = []) {
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
