import { money } from './format.js';
import * as deficitBars from './charts/deficit-bars.js';
import * as funnel from './charts/funnel.js';
import { renderCuts } from './cuts.js';
export { renderCuts };
import { mountGapToggle, gapMoney } from './gapui.js';
import { figureSpan, srcData, mountPopovers, renderSources, fig, isOurs, OURS_PREFIX, expandUrls } from './sources.js';
export { mountPopovers, renderSources };
import { renderGlossary, wireGlossaryLinks } from './glossary.js';
export { renderGlossary };
export { mountGapToggle };
import { mountClaims, claimCardModel } from './claims.js';
export { mountClaims, claimCardModel };
import * as sankey from './charts/sankey.js';
import { themeColors, observeWidth } from './charts/util.js';
import { mountSectionBar } from './nav.js';
import * as bm from './charts/budget-map.js';
import { renderWhy } from './why.js';
export { renderWhy };
import { renderGapStory } from './gapstory.js';
export { renderGapStory };
import { renderPiles } from './piles.js';
export { renderPiles };
import { renderMethods } from './methods.js';
export { renderMethods };

const FILES = {
  headline: 'headline', series: 'series', structural: 'structural_deficit', funnel: 'funnel',
  flows: 'flows', cuts: 'cuts', gap: 'gap', claims: 'claims', glossary: 'glossary',
  budgetTree: 'budget_tree', whyShort: 'why_short', gapStory: 'gap_story', pilesUp: 'piles_up',
};

export async function loadData() {
  try {
    const entries = await Promise.all(Object.entries(FILES).map(async ([key, file]) => {
      const res = await fetch(`../data/build/${file}.json`);
      if (!res.ok) throw new Error(`${file}.json: HTTP ${res.status}`);
      return [key, expandUrls(await res.json())];
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
  t.replaceChildren(figureSpan(h.total_budget_m, money(h.total_budget_m.value)));
}

function renderHowLong(data) {
  const prep = deficitBars.prepare(data.structural);
  prep.fy27_adopted = data.gap.post_cut_city_m;
  // The worst year counting the skipped reserve deposit, as the IBA printed it (IBA 26-11 p.78: $203.8M).
  const worst = data.gapStory?.headlines?.worst;
  if (worst) prep.peak_top = { fy: worst.fy, figure: worst.value_m };
  for (const sp of document.querySelectorAll('[data-fy-fig]')) {
    const b = prep.bars.find((x) => x.fy === Number(sp.dataset.fyFig));
    sp.replaceWith(fig(b.figure, money(b.value_m)));
  }
  // Bar top including the skipped reserve deposit: the printed figure where there is one, else our own sum.
  for (const sp of document.querySelectorAll('[data-fy-top]')) {
    const fy = Number(sp.dataset.fyTop);
    const b = prep.bars.find((x) => x.fy === fy);
    if (prep.peak_top?.fy === fy) sp.replaceWith(figureSpan(prep.peak_top.figure, `$${prep.peak_top.figure.value.toFixed(1)}M`));
    else sp.replaceWith(fig(b.top_figure, money(b.top_m)));
  }
  const chart = document.getElementById('ch1-chart');
  const dig = document.getElementById('ch1-dig-chart');
  deficitBars.renderNotes(document.getElementById('ch1-notes'), prep);
  mountPopovers(document.getElementById('ch1-notes'));
  observeWidth(chart, () => { deficitBars.render(chart, prep, themeColors()); mountPopovers(chart); });
  observeWidth(dig, () => { if (dig.getBoundingClientRect().width > 0) deficitBars.renderDig(dig, prep, themeColors()); });
}

function renderFunnel(data) {
  const el = document.getElementById('ch2-funnel');
  const prep = funnel.prepare(data.headline, data.funnel);
  const captions = [1, 2, 3, 4].map((n) => el.getAttribute(`data-caption-${n}`));
  observeWidth(el, () => { funnel.render(el, prep, themeColors(), captions, { onStep: () => mountPopovers(el) }); mountPopovers(el); });
}

// ---- Section 1: pots bar, twin money maps, details panel ---------------------------------------
// Category palette (validated with the dataviz validator, light and dark) lives in styles.css as --cat-1..--cat-10.
function mapColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { cat: Array.from({ length: 10 }, (_, i) => v(`--cat-${i + 1}`)), ink: v('--on-fill-dark'), paper: v('--on-fill-light') };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// A sourced amount; an our-arithmetic source says so on screen. No source: plain text (never an unsourced .figure).
function amountSpan(src, text) {
  const wrap = el('span', 'amt');
  if (!src?.url) { wrap.textContent = text; return wrap; }
  wrap.append(fig({ source: src }, text));
  return wrap;
}

// Descriptive copy with its source as a footnote (categories have shared, unsourced definitions).
function citedText(text, src) {
  const s = el('span', src?.url ? 'cite' : null, text);
  if (src?.url) srcData(s, src);
  return s;
}

function potPanelBody(tree, pot) {
  const m = bm.potPanel(pot, tree);
  const amt = el('p', 'panel-amt');
  amt.append(amountSpan(m.src, money(m.value_m)), ` in the FY${tree.bar_fy} budget, ${bm.shareText(m.share)} of the city budget.`);
  const dl = el('dl', 'panel-answers');
  for (const a of m.answers) {
    const dd = el('dd');
    dd.append(citedText(a.text, a.src));
    dl.append(el('dt', null, a.q), dd);
  }
  const out = [el('h3', 'panel-title', m.title), amt, dl];
  for (const n of m.notes) out.push(el('p', 'panel-note', n));
  return out;
}

function nodePanelBody(tree, node, parent) {
  const m = bm.nodePanel(node, parent, tree);
  const amt = el('p', 'panel-amt');
  const share = bm.shareOf(node, parent);
  amt.append(amountSpan(m.amount_src, money(m.amount_m)), ` in the FY${m.fy} budget${share ? `, ${share}` : ''}.`);
  const out = [el('h3', 'panel-title', m.title), amt];
  if (m.text) { const p = el('p', 'panel-desc'); p.append(citedText(m.text, m.descSrc)); out.push(p); }
  if (m.note) out.push(el('p', 'panel-note', m.note));
  if (m.lines) {
    out.push(el('p', 'panel-note', m.lines.lead));
    const ul = el('ul', 'panel-lines');
    for (const it of m.lines.items) {
      const li = el('li');
      li.append(el('span', null, it.name), el('span', 'figure', money(it.value_m)));
      ul.append(li);
    }
    out.push(ul);
    if (m.lines.rest) out.push(el('p', 'panel-note', m.lines.rest));
  }
  const off = bm.offsetsFigure(node, tree);
  if (off) {
    const p = el('p', 'panel-note');
    p.append('Also includes credits such as budgeted vacancy savings: ', amountSpan(off.source, off.text));
    out.push(p);
  }
  if (m.opens) out.push(el('p', 'panel-note', 'Its parts are now shown in the map. To go back, use the path above the map.'));
  if (m.link) { const a = el('a', 'read-more', 'Read more ↓'); a.href = m.link; out.push(a); }
  return out;
}

export function renderWhat(data) {
  const tree = data.budgetTree;
  for (const sp of document.querySelectorAll('[data-hl-fig]')) {
    const f = data.headline[sp.dataset.hlFig];
    sp.replaceWith(figureSpan(f, money(f.value)));
  }
  const potsEl = document.getElementById('s1-pots');
  const mapsEl = document.getElementById('s1-maps');
  const panel = document.getElementById('s1-panel');
  panel.classList.add('map-panel');
  const cols = { in: el('div', 'map-col'), out: el('div', 'map-col') };
  cols.in.dataset.side = 'in';
  cols.out.dataset.side = 'out';
  mapsEl.replaceChildren(cols.in, cols.out);

  let state = bm.createState(tree);
  let colors = mapColors();
  let pots = null;
  let lastUsed = null; // null (on load) | 'pots' | 'in' | 'out'
  let lastFrom = 'map'; // within a map column: 'map' (a box or a crumb) | 'list' (the list twin)
  const narrow = () => window.matchMedia('(max-width: 639.98px)').matches;

  // The panel sits below both maps. On a phone, once the reader has used a control, it moves next to that control so
  // the answer appears where they are looking (the v1 Sankey did the same with its flow panel): under the pots bar,
  // under the map, or, after a tap in the list twin, right after that list.
  const place = () => {
    if (!narrow() || !lastUsed) { if (mapsEl.nextElementSibling !== panel) mapsEl.after(panel); return; }
    if (lastUsed === 'pots') { if (potsEl.nextElementSibling !== panel) potsEl.after(panel); return; }
    const at = cols[lastUsed].querySelector(lastFrom === 'list' ? '.maplist' : '.map-box');
    if (at && at.nextElementSibling !== panel) at.after(panel);
  };
  // After a list tap on a phone, bring the panel up if it landed below the screen; the tapped item keeps focus.
  const reveal = () => {
    if (!narrow()) return;
    const r = panel.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.85) window.scrollBy({ top: r.top - window.innerHeight * 0.5, behavior: 'instant' });
  };

  // Rulings R13/R13a: announcements go through one stationary, visually hidden status element that is never moved
  // (a live region that was just re-inserted is often not announced, and the panel moves on phones). It is polite
  // from page load (index.html) and stays empty until the first user action, so nothing is read on load. The panel
  // itself carries no aria-live.
  const status = document.getElementById('s1-status');
  const announce = (text) => { if (status) status.textContent = text; };

  const showPanel = (speak) => {
    const pot = tree.pots.find((p) => p.id === state.pot);
    panel.style.setProperty('--pot', colors.cat[tree.pots.indexOf(pot)]);
    let body;
    let said;
    if (!state.selected) {
      body = potPanelBody(tree, pot);
      said = bm.statusText(pot, null, tree);
    } else {
      const { side, node } = state.selected;
      const path = state[side];
      const top = path[path.length - 1];
      body = nodePanelBody(tree, node, top === node ? (path[path.length - 2] ?? null) : top);
      said = bm.statusText(null, node, tree, top === node);
    }
    panel.replaceChildren(...body);
    mountPopovers(panel);
    if (speak) announce(said);
  };

  const drawSide = (side) => {
    bm.render(cols[side], state, tree, colors, handlers);
    mountPopovers(cols[side]);
    place();
  };

  const handlers = {
    onActivate(side, node, { from, slot }) {
      const opened = (node.children ?? []).length > 0;
      state = bm.activate(state, side, node);
      lastUsed = side;
      lastFrom = from === 'list' ? 'list' : 'map';
      drawSide(side);
      showPanel(true);
      const sel = from === 'list' ? '.list-item' : '.cell';
      const target = opened ? cols[side].querySelector(sel) : cols[side].querySelector(`${sel}[data-slot="${slot}"]`);
      if (target) target.focus({ preventScroll: from === 'list' });
      if (from === 'list') reveal();
    },
    onUp(side, depth) {
      state = bm.goUp(state, side, depth);
      const path = state[side];
      // Going back up to a box (not the pot's top level) shows that box's details.
      if (path.length > 1) state = { ...state, selected: { side, node: path[path.length - 1] } };
      lastUsed = side;
      lastFrom = 'map';
      drawSide(side);
      showPanel(true);
      const first = cols[side].querySelector('.cell');
      if (first) first.focus();
    },
  };

  const selectPot = (id) => {
    state = bm.selectPot(state, tree, id);
    lastUsed = 'pots';
    pots.select(id);
    drawSide('in');
    drawSide('out');
    showPanel(true);
  };

  const drawPots = () => { pots = bm.renderPots(potsEl, tree, state, colors, selectPot); place(); };
  // Links elsewhere on the page (section 4's "Construction projects pot") open a pot by id.
  document.addEventListener('select-pot', (e) => { if (tree.pots.some((p) => p.id === e.detail)) selectPot(e.detail); });
  observeWidth(potsEl, drawPots);
  observeWidth(cols.in, () => drawSide('in'));
  observeWidth(cols.out, () => drawSide('out'));
  showPanel(false);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    colors = mapColors();
    drawPots();
    drawSide('in');
    drawSide('out');
    showPanel(false);
  });
}

// ---- Dig deeper: money-flow Sankey + selected-flow panel -------------------------------------
// A flow's amount as a sourced figure; a flow that is our own sum says "(our arithmetic)" beside it.
function flowAmount(link) {
  return fig({ source: link.ref }, money(link.value));
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
  yr.textContent = isOurs(link.ref) ? `Our arithmetic: ${link.ref.doc.slice(OURS_PREFIX.length)}.` : `Source: ${link.ref.doc}.`;
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

function renderGapCalc(data) {
  const g = data.gap;
  for (const sp of document.querySelectorAll('[data-gap-fig]')) {
    const f = g[sp.dataset.gapFig];
    sp.replaceWith(figureSpan(f, gapMoney(f.value)));
  }
  mountGapToggle(document.getElementById('ch3-calc'), g);
}

function renderClaims(data) {
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
  mountSectionBar();
  mountDigDeeper(document);
  const data = await loadData();
  if (new URLSearchParams(location.search).has('debug')) window.__data = data;
  guarded('headline', null, () => renderHeadline(data.headline));
  guarded('glossary', 'glossary-list', () => renderGlossary(document.getElementById('glossary-list'), data.glossary));
  // Section order on the page: what, why-short, gap, piles, how-long, claims. Later tasks add their renderers here.
  guarded('section 1: budget maps', 's1-maps', () => renderWhat(data));
  guarded('section 1 dig: money-flow Sankey', 'ch2-sankey', () => renderSankey(data.flows));
  guarded('section 1 dig: how we built this', 's1-methods', () => renderMethods(document.getElementById('s1-methods'), data.budgetTree));
  guarded('section 2: why a wealthy city is short', 's2-blocks', () => renderWhy(document.getElementById('why-short'), data.whyShort));
  guarded('section 3: the gap', 's3-headlines', () => renderGapStory(document.getElementById('gap'), data.gapStory));
  guarded('section 3: gap calculator', 'ch3-calc', () => renderGapCalc(data));
  guarded('section 3 dig: funnel', 'ch2-funnel', () => renderFunnel(data));
  guarded('section 3 dig: cuts', 'ch2-cuts', () => renderCuts(document.getElementById('ch2-cuts'), data.cuts));
  guarded('section 4: what piles up', 's4-reserve', () => renderPiles(document.getElementById('piles'), data.pilesUp));
  guarded('section 5: how long', 'ch1-chart', () => renderHowLong(data));
  guarded('section 6: claims', 'ch4-claims', () => renderClaims(data));
  guarded('popovers', null, () => mountPopovers(document));
  guarded('sources', 'sources-list', () => renderSources(document.getElementById('sources-list'), data));
  guarded('glossary links', null, () => wireGlossaryLinks(document));
  document.dispatchEvent(new CustomEvent('data-ready', { detail: data }));
}

if (typeof document !== 'undefined') main().catch((e) => console.error(e));
