// Chapter 4 claim cards: a tablist of chips, one open tabpanel at a time.
import { figureSpan, mountPopovers } from './sources.js';
import * as claimChart from './charts/claim-chart.js';
import { linkTerms } from './glossary.js';
import { themeColors, observeWidth } from './charts/util.js';

const CHIP_LABELS = {
  'bike-lanes': 'Bike lanes vs roads',
  pensions: 'Pensions',
  managers: 'Too many managers',
  'trash-fee': 'Trash fee',
  homelessness: 'Homelessness spending',
};
const PREFIX = "What this doesn't tell you: ";
// A card's link elsewhere on the page, named for what it leads to.
const LINK_TEXT = { 'bike-lanes': 'How projects are chosen ↓' };
// First use of a glossary term in each card links to its entry.
const TERMS = [
  [/General Fund/, 'general-fund'],
  [/required pension payment/, 'pension-adc'],
  [/one-time (?=federal|money|resources)/, 'one-time-resources'],
];

export function claimCardModel(claim) {
  return {
    id: claim.id,
    chipLabel: CHIP_LABELS[claim.id] || claim.claim.split(' ').slice(0, 4).join(' '),
    claimText: `"${claim.claim}"`,
    finding: claim.finding,
    hasChart: claim.chart != null,
    chart: claim.chart ?? null,
    matched: claim.matched_projects && claim.matched_projects.length ? claim.matched_projects : null,
    caveatText: PREFIX + claim.caveat,
    link: claim.link ? { href: claim.link, text: LINK_TEXT[claim.id] || 'Read more ↓' } : null,
    sources: claim.sources.map((s) => ({ text: s.page != null ? `${s.doc}, page ${s.page}` : s.doc, url: s.url })),
  };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// The bike card's link leads to "How projects are chosen", which sits in that part's Dig deeper: open it and go there.
// Without the target on the page this is plain anchor navigation.
function openLinkTarget(e) {
  const target = document.querySelector(e.currentTarget.getAttribute('href'));
  const dig = target?.querySelector('details.dig');
  if (!dig) return;
  e.preventDefault();
  dig.open = true;
  const spot = dig.querySelector('[data-anchor]') || target;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  spot.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
}

export function mountClaims(root, claims) {
  root.replaceChildren();
  const models = claims.map(claimCardModel);
  const tabs = el('div', 'chips');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Claims people make about the budget');
  const panel = el('div', 'claim-card');
  panel.hidden = true;
  let selected = -1;
  let stop = null;
  const chips = models.map((m, i) => {
    const b = el('button', 'chip', m.chipLabel);
    b.type = 'button';
    b.id = `claim-tab-${m.id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('aria-controls', 'claim-panel');
    b.tabIndex = i === 0 ? 0 : -1;
    return b;
  });
  tabs.append(...chips);

  const build = (m, claim) => {
    const h = el('h3', 'claim-q', m.claimText);
    h.tabIndex = -1;
    const finding = el('p', 'claim-finding');
    finding.append(...linkTerms(m.finding, TERMS));
    const parts = [h, finding];
    let chartBox = null;
    if (m.hasChart) {
      const fig = el('figure', 'chart claim-fig');
      chartBox = el('div', 'claim-chart');
      fig.append(chartBox);
      parts.push(fig);
    }
    if (m.matched) {
      const d = el('details', 'claim-matched');
      d.append(el('summary', null, `Projects counted as bike or pedestrian (${m.matched.length})`));
      const ul = el('ul');
      m.matched.forEach((p) => ul.append(el('li', null, p)));
      d.append(ul);
      parts.push(d);
    }
    parts.push(el('p', 'claim-caveat', m.caveatText));
    if (m.link) {
      const a = el('a', 'read-more', m.link.text);
      a.href = m.link.href;
      a.addEventListener('click', openLinkTarget);
      parts.push(a);
    }
    const sh = el('h4', 'claim-src-h', 'Sources');
    const ul = el('ul', 'claim-sources');
    m.sources.forEach((s) => {
      const li = el('li');
      const a = el('a', null, s.text);
      a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
      li.append(a);
      ul.append(li);
    });
    parts.push(sh, ul);
    panel.replaceChildren(...parts);
    if (chartBox) {
      const src = claim.sources[0];
      stop = observeWidth(chartBox, (w) => {
        if (w <= 0) return;
        claimChart.render(chartBox, claim.chart, themeColors(), src);
        mountPopovers(chartBox);
      });
    }
    return h;
  };

  const select = (i) => {
    if (stop) { stop(); stop = null; }
    if (i === selected) {
      selected = -1;
      panel.hidden = true;
      panel.replaceChildren();
      panel.removeAttribute('aria-labelledby');
      chips.forEach((c) => c.setAttribute('aria-selected', 'false'));
      return;
    }
    selected = i;
    chips.forEach((c, j) => c.setAttribute('aria-selected', String(j === i)));
    panel.hidden = false;
    panel.id = 'claim-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', chips[i].id);
    const h = build(models[i], claims[i]);
    h.focus({ preventScroll: true });
    const r = panel.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.7) {
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    }
    mountPopovers(panel);
  };

  const move = (to) => {
    chips.forEach((c, j) => { c.tabIndex = j === to ? 0 : -1; });
    chips[to].focus();
  };
  chips.forEach((c, i) => {
    c.addEventListener('click', () => { move(i); select(i); });
    c.addEventListener('keydown', (e) => {
      const n = chips.length;
      const to = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n, ArrowLeft: (i + n - 1) % n, ArrowUp: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); move(to); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    });
  });
  root.append(tabs, panel);
}
