import { money } from './format.js';
import * as deficitBars from './charts/deficit-bars.js';
import * as funnel from './charts/funnel.js';
import { renderCuts } from './cuts.js';
export { renderCuts };
import * as sankey from './charts/sankey.js';
import { themeColors, observeWidth } from './charts/util.js';

const FILES = {
  headline: 'headline', series: 'series', structural: 'structural_deficit', funnel: 'funnel',
  flows: 'flows', cuts: 'cuts', gap: 'gap', claims: 'claims', glossary: 'glossary',
};

export async function loadData() {
  try {
    const entries = await Promise.all(Object.entries(FILES).map(async ([key, file]) => {
      const res = await fetch(`../data/build/${file}.json`);
      if (!res.ok) throw new Error(`${file}.json: HTTP ${res.status}`);
      return [key, await res.json()];
    }));
    return Object.fromEntries(entries);
  } catch (err) {
    const box = document.getElementById('load-error');
    if (box) {
      box.textContent = `The data for this page could not be loaded (${err.message}). Reload the page, or try again later.`;
      box.hidden = false;
    }
    throw err;
  }
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

// ---- Dig deeper ---------------------------------------------------------
// Native <details> handles open/close without JS; this only guarantees every panel has a summary.
export function mountDigDeeper(root = document) {
  root.querySelectorAll('details.dig').forEach((d) => {
    if (!d.querySelector('summary')) {
      const s = document.createElement('summary');
      s.textContent = 'Dig deeper';
      d.prepend(s);
    }
  });
}

// ---- Progress -------------------------------------------------------------
export function mountProgress() {
  const bar = document.getElementById('progress');
  if (!bar) return;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const f = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.width = `${f * 100}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// ---- Headline + glossary ------------------------------------------------------
export function figureSpan(fig, text) {
  const s = document.createElement('span');
  s.className = 'figure';
  s.dataset.srcDoc = fig.source.doc;
  s.dataset.srcPage = fig.source.page ?? '';
  s.dataset.srcUrl = fig.source.url;
  s.textContent = text;
  return s;
}

function renderHeadline(h) {
  const t = document.getElementById('dek-total');
  const g = document.getElementById('dek-gf');
  t.replaceChildren(figureSpan(h.total_budget_m, money(h.total_budget_m.value)));
  g.replaceChildren(figureSpan(h.general_fund_m, money(h.general_fund_m.value)));
}

function slug(term) { return term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function renderGlossary(items) {
  const dl = document.getElementById('glossary-list');
  for (const { term, plain } of items) {
    const dt = document.createElement('dt');
    dt.id = `g-${slug(term)}`;
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = plain;
    dl.append(dt, dd);
  }
}

function renderChapter1(data) {
  const prep = deficitBars.prepare(data.structural);
  prep.fy27_adopted = data.gap.post_cut_city_m;
  for (const sp of document.querySelectorAll('[data-fy-fig]')) {
    const b = prep.bars.find((x) => x.fy === Number(sp.dataset.fyFig));
    sp.replaceWith(figureSpan(b.figure, money(b.value_m)));
  }
  for (const sp of document.querySelectorAll('[data-marker-fig]')) {
    const mk = prep.markers.find((x) => x.fy === Number(sp.dataset.markerFig));
    sp.replaceWith(figureSpan(mk.source, money(mk.source.value)));
  }
  const chart = document.getElementById('ch1-chart');
  const dig = document.getElementById('ch1-dig-chart');
  deficitBars.renderNotes(document.getElementById('ch1-notes'), prep);
  mountPopovers(document.getElementById('ch1-notes'));
  observeWidth(chart, () => { deficitBars.render(chart, prep, themeColors()); mountPopovers(chart); });
  observeWidth(dig, () => { if (dig.getBoundingClientRect().width > 0) deficitBars.renderDig(dig, prep, themeColors()); });
}

function renderChapter2(data) {
  for (const sp of document.querySelectorAll('[data-hl-fig]')) {
    const f = data.headline[sp.dataset.hlFig];
    sp.replaceWith(figureSpan(f, money(f.value)));
  }
  const el = document.getElementById('ch2-funnel');
  const prep = funnel.prepare(data.headline, data.funnel);
  const captions = [1, 2, 3, 4].map((n) => el.getAttribute(`data-caption-${n}`));
  observeWidth(el, () => { funnel.render(el, prep, themeColors(), captions); mountPopovers(el); });
  renderSankey(data.flows);
  renderCuts(document.getElementById('ch2-cuts'), data.cuts);
}

// ---- Dig deeper: money-flow Sankey + selected-flow panel -------------------------------------
function srcData(el, src) {
  el.dataset.srcDoc = src.doc;
  el.dataset.srcPage = src.page ?? '';
  el.dataset.srcUrl = src.url;
}

function flowAmount(link) {
  const amt = document.createElement('span');
  amt.className = 'figure';
  srcData(amt, link.ref);
  amt.textContent = money(link.value);
  return amt;
}

// The panel is not a live region until the reader selects a flow, so pre-selection and re-renders stay silent.
function showFlow(panel, link, silent) {
  const key = sankey.linkKey(link);
  if (silent && panel.dataset.key === key) return;
  panel.dataset.key = key;
  if (!silent) panel.setAttribute('aria-live', 'polite');
  const h = document.createElement('p');
  h.className = 'flow-title';
  h.append(sankey.linkLabel(link), ' ', flowAmount(link));
  const rule = document.createElement('p');
  rule.className = 'flow-rule';
  rule.textContent = link.rule;
  const yr = document.createElement('p');
  yr.className = 'flow-year';
  yr.textContent = `Source: ${link.ref.doc}.`;
  panel.replaceChildren(h, rule, yr);
  mountPopovers(panel);
}

function buildFlowList(prep) {
  const det = document.createElement('details');
  det.className = 'flowlist';
  const sum = document.createElement('summary');
  sum.textContent = 'All flows as text';
  det.append(sum);
  for (const grp of sankey.groupFlows(prep)) {
    const h = document.createElement('h4');
    h.textContent = grp.rule.label;
    const ul = document.createElement('ul');
    for (const l of grp.links) {
      const li = document.createElement('li');
      if (l.highlight) li.className = 'is-highlight';
      const t = document.createElement('p');
      t.className = 'flow-title';
      t.append(`${l.sourceLabel} \u2192 ${l.targetLabel}: `, flowAmount(l));
      if (l.highlight) t.append(' (highlighted flow)');
      const r = document.createElement('p');
      r.className = 'flow-rule';
      r.textContent = l.rule;
      li.append(t, r);
      ul.append(li);
    }
    det.append(h, ul);
  }
  return det;
}

function renderSankey(flows) {
  const el = document.getElementById('ch2-sankey');
  const panel = document.createElement('div');
  panel.className = 'flow-panel';
  const prep = sankey.prepare(flows);
  const list = buildFlowList(prep);
  el.after(list);
  mountPopovers(list);
  const captions = [0, 1, 2].map((n) => el.getAttribute(`data-col-${n}`));
  let selected = null;
  observeWidth(el, (w) => {
    if (w <= 0) return; // <details> still closed; draws on first open
    const narrow = w < 600;
    if (narrow) el.before(panel); else el.after(panel); // narrow: selection sits above the chart, in view
    list.classList.toggle('narrow', narrow);
    if (narrow) list.open = true;
    sankey.render(el, prep, themeColors(), (l, o) => { selected = sankey.linkKey(l); showFlow(panel, l, !!(o && o.silent)); }, { captions, selected });
  });
}

async function main() {
  mountProgress();
  mountDigDeeper(document);
  const data = await loadData();
  window.__data = data;
  renderHeadline(data.headline);
  renderGlossary(data.glossary);
  renderChapter1(data);
  renderChapter2(data);
  mountPopovers(document);
  document.dispatchEvent(new CustomEvent('data-ready', { detail: data }));
}

if (typeof document !== 'undefined') main().catch((e) => console.error(e));
