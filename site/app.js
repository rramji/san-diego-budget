import { money } from './format.js';
import * as deficitBars from './charts/deficit-bars.js';
import * as funnel from './charts/funnel.js';
import { renderCuts } from './cuts.js';
export { renderCuts };
import { mountGapToggle, gapMoney } from './gapui.js';
import { figureSpan, srcData, mountPopovers, renderSources } from './sources.js';
export { mountPopovers, renderSources };
import { renderGlossary, wireGlossaryLinks } from './glossary.js';
export { renderGlossary };
export { mountGapToggle };
import { mountClaims, claimCardModel } from './claims.js';
export { mountClaims, claimCardModel };
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

// ---- Headline ------------------------------------------------------
function renderHeadline(h) {
  const t = document.getElementById('dek-total');
  const g = document.getElementById('dek-gf');
  t.replaceChildren(figureSpan(h.total_budget_m, money(h.total_budget_m.value)));
  g.replaceChildren(figureSpan(h.general_fund_m, money(h.general_fund_m.value)));
}

function renderChapter1(data) {
  const prep = deficitBars.prepare(data.structural);
  prep.fy27_adopted = data.gap.post_cut_city_m;
  for (const sp of document.querySelectorAll('[data-fy-fig]')) {
    const b = prep.bars.find((x) => x.fy === Number(sp.dataset.fyFig));
    sp.replaceWith(figureSpan(b.figure, money(b.value_m)));
  }
  // Bar top including the skipped reserve deposit (a derived figure, sourced to the IBA's "including reserves" row).
  for (const sp of document.querySelectorAll('[data-fy-top]')) {
    const b = prep.bars.find((x) => x.fy === Number(sp.dataset.fyTop));
    sp.replaceWith(figureSpan(b.top_figure, money(b.top_m)));
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
    const h = document.createElement('h3');
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

function renderChapter3(data) {
  const g = data.gap;
  for (const sp of document.querySelectorAll('[data-gap-fig]')) {
    const f = g[sp.dataset.gapFig];
    sp.replaceWith(figureSpan(f, gapMoney(f.value)));
  }
  mountGapToggle(document.getElementById('ch3-calc'), g);
}

function renderChapter4(data) {
  mountClaims(document.getElementById('ch4-claims'), data.claims);
}

// One part failing to render must not take the later chapters with it: log it and say so in that part's mount.
export function guarded(name, mountId, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`${name} failed to render`, err);
    const mount = mountId && document.getElementById(mountId);
    if (mount) {
      const p = document.createElement('p');
      p.className = 'render-error';
      p.textContent = 'This part of the page could not be drawn. Reload the page to try again; the rest of the page is unaffected.';
      mount.replaceChildren(p);
    }
  }
}

async function main() {
  mountProgress();
  mountDigDeeper(document);
  const data = await loadData();
  if (new URLSearchParams(location.search).has('debug')) window.__data = data;
  guarded('headline', null, () => renderHeadline(data.headline));
  guarded('glossary', 'glossary-list', () => renderGlossary(document.getElementById('glossary-list'), data.glossary));
  guarded('chapter 1', 'ch1-chart', () => renderChapter1(data));
  guarded('chapter 2', 'ch2-funnel', () => renderChapter2(data));
  guarded('chapter 3', 'ch3-calc', () => renderChapter3(data));
  guarded('chapter 4', 'ch4-claims', () => renderChapter4(data));
  guarded('popovers', null, () => mountPopovers(document));
  guarded('sources', 'sources-list', () => renderSources(document.getElementById('sources-list'), data));
  guarded('glossary links', null, () => wireGlossaryLinks(document));
  document.dispatchEvent(new CustomEvent('data-ready', { detail: data }));
}

if (typeof document !== 'undefined') main().catch((e) => console.error(e));
