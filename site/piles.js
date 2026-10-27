// Section 4: what piles up (reserves, infrastructure, pension). renderPiles() fills the three parts' mounts from
// piles_up.json; the chart maths lives in charts/piles.js (pure, Node-tested).
// Colour roles: --restricted is money in hand, --gap is what is missing; the payer bar highlights the General Fund.
import { figureSpan, srcData, mountPopovers } from './sources.js';
import * as piles from './charts/piles.js';
import { inkOn } from './charts/budget-map.js';
import { observeWidth } from './charts/util.js';

const OURS = 'our arithmetic';
const { m1, bn } = piles;
const pctText = (v) => `${v}%`;

function h(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids.filter((k) => k != null && k !== false));
  return e;
}
// A sourced figure; an our-arithmetic source says so on screen.
function fig(f, text) {
  const s = figureSpan(f, text);
  if (!f.source.doc.startsWith(OURS)) return s;
  return h('span', null, s, ` (${OURS})`);
}
function cite(src, text) {
  const s = h('span', 'cite', text);
  srcData(s, src);
  return s;
}
function gl(slug, text) {
  const a = h('a', 'gl', text);
  a.href = `#g-${slug}`;
  return a;
}
const p = (...kids) => h('p', null, ...kids);

// Lead placeholders: <span data-pile-fig="reserves.balance_m" data-fmt="m1">.
const FMT = { m1: (v) => m1(v), bn: (v) => bn(v), cents: (v) => `${Math.round(v)} cents`, pct: pctText };
function fillLeads(root, d) {
  for (const sp of root.querySelectorAll('[data-pile-fig]')) {
    const key = sp.dataset.pileFig;
    const f = key.split('.').reduce((o, k) => o?.[k], d);
    if (!f?.source) throw new Error(`piles lead: no figure at ${key}`);
    sp.replaceWith(figureSpan(f, (FMT[sp.dataset.fmt] ?? String)(f.value)));
  }
}

// ---- 4a. The rainy-day reserve ----
function reserve(el, copy, dig, d) {
  const r = d.reserves, c = d.cites;
  const chart = h('div', 'pile-chart');
  el.replaceChildren(
    h('p', 'pile-title', 'The reserve, as a share of a year’s General Fund income'),
    chart,
    h('figcaption', 'chart-cap', 'The reserve policy sets its targets as a share of the General Fund’s yearly operating income, averaged over the last three audited years. The balance is from the city’s year-end report; the dollar target is the IBA’s.'));
  piles.renderReserve(chart, piles.prepareReserve(r), { fig });
  copy.replaceChildren(
    p('In FY2026 the city took ', fig(r.draw_m, m1(r.draw_m.value)), ' out of the reserve to end the year balanced, ',
      cite(c.iba_ye, 'which the IBA calls the first draw on these reserves in recent history'), '. ',
      cite(c.storm, 'The main reason was state reimbursements for the January 2024 storm that had not arrived by the end of the year'),
      '; ', cite(c.iba_ye, 'the city has said it will put that money back into the reserve when it comes'), '.'),
    p(cite(c.unchanged, 'The reserve has not grown since FY2023'), ', because budgets have skipped the deposits the policy calls for. The FY2027 budget skips about ',
      fig(r.skipped_m, m1(r.skipped_m.value)), '.'),
    p('If the city makes no deposits in FY2027 and FY2028 and then adds 1% of its income a year, the highest rate under discussion, the IBA estimates it could take about ',
      fig(r.years_to_goal, `${r.years_to_goal.value} years`), ' to reach the ', fig(r.goal_pct, pctText(r.goal_pct.value)), ' goal.'));
  dig.replaceChildren(
    h('h4', null, 'Two funds, two sets of rules'),
    p(cite(c.reserve_rules, 'The reserve is two funds. The Emergency Reserve is for true emergencies such as a natural disaster, and using it takes a two-thirds vote of the Council declaring a public emergency. The Stability Reserve covers unexpected drops in income or unplanned critical costs.')),
    h('h4', null, 'What these numbers can’t tell you yet'),
    p(cite(c.iba_ye, 'The FY2026 year-end figures are not audited. They become final only when the city’s audited annual financial report is done.'),
      ' The skipped deposit of about ', fig(r.skipped_m, m1(r.skipped_m.value)),
      ' was worked out before the FY2026 draw; the documents we read don’t give the shortfall after it.'),
    p(cite(c.iba_ye, 'The city plans to propose a revised reserve policy by the end of 2026.'), ' The FY2030 goal is still the policy on paper.'));
}

// ---- 4b. Roads and buildings ----
function assets(el, d) {
  const inf = d.infrastructure;
  const rows = piles.prepareAssets(inf.by_asset);
  const rest = rows.find((r) => r.rest);
  const chart = h('div', 'pile-chart');
  el.replaceChildren(h('p', 'pile-title', 'Unfunded need by type of asset, FY2027–FY2031'), chart,
    h('figcaption', 'chart-cap', `“Everything else” adds up the other ${rest.count} types (our arithmetic), ${rest.zero.length} of them at $0.`));
  piles.renderAssets(chart, rows, { fig });
  return h('p', null, 'Water and sewer projects aren’t in the gap. The plan counts them, like Pure Water, airports, golf and landfills, as fully paid for by their own customers’ fees, so ',
    cite(d.cites.gf_only_gap, 'the whole gap falls on things the General Fund pays for'), ': storm drains, streets, sidewalks, streetlights, parks, and fire and police stations.');
}

function roads(el, d) {
  const rd = d.infrastructure.roads;
  const q = (t) => `“${t}”`;
  const chart = h('div', 'pile-chart pci-host');
  el.replaceChildren(
    h('h4', 'pile-sub', 'Roads'),
    p('Streets are scored from 0 to 100 (the ', gl('pavement-condition-index-pci', 'Pavement Condition Index'), ', or PCI). San Diego’s scored ',
      fig(rd.pci_2016, String(rd.pci_2016.value)), ' in the 2016 survey and ', fig(rd.pci_2023, String(rd.pci_2023.value)), `, ${q('fair')}, in the last full survey, in 2023, when `,
      fig(rd.poor_share_pct, rd.poor_share_text), ` of streets scored ${q('poor')} or worse.`),
    p('Paving money in FY2026 was about ', fig(rd.funding_share_pct, pctText(rd.funding_share_pct.value)),
      ' of what the city’s 2024 pavement plan said was needed to reach a score of 70, so the city lowered its goal from ',
      fig(rd.goal_old, String(rd.goal_old.value)), ' to ', fig(rd.goal_new, String(rd.goal_new.value)), '. On the money it expects, it projects the score falling to ',
      fig(rd.pci_2036, String(rd.pci_2036.value)), `, ${q('poor')}, by FY2036.`),
    h('p', 'pile-title', 'Average street score (PCI)'),
    chart,
    h('p', 'chart-cap', 'Solid line: measured in the 2016 and 2023 surveys. Dashed line: the city’s projection on the money it expects, starting from ',
      fig(rd.pci_2027, String(rd.pci_2027.value)), ' in FY2027, which ',
      cite(rd.pci_2036.source, 'it will refine after the next full survey'), '.'));
  const prep = piles.preparePci(rd);
  const draw = () => piles.renderPci(chart, prep);
  observeWidth(chart, (w) => { if (w > 0) draw(); });
}

function selectCipPot(e) {
  e.preventDefault();
  document.dispatchEvent(new CustomEvent('select-pot', { detail: 'cip' }));
  document.getElementById('what')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function openClaim(e) {
  const chip = document.getElementById('claim-tab-bike-lanes');
  if (!chip) return; // no claims mounted: plain anchor navigation
  e.preventDefault();
  if (chip.getAttribute('aria-selected') !== 'true') chip.click();
  else chip.scrollIntoView({ block: 'center' });
}

function infraDig(el, d) {
  const inf = d.infrastructure, f = inf.funded;
  const what = h('a', null, 'The Construction projects pot in the budget map');
  what.href = '#what';
  what.addEventListener('click', selectCipPot);
  const claim = h('a', null, 'the bike-lane claim');
  claim.href = '#claim-tab-bike-lanes';
  claim.addEventListener('click', openClaim);
  const steps = h('ol', 'pile-steps', ...inf.process.map((s) => h('li', null, h('span', 'ps-when', s.step), ' ', cite(s.source, s.text))));
  el.replaceChildren(
    h('h4', null, 'Some of what isn’t paid for'),
    h('ul', 'pile-list', ...inf.examples.map((e) => h('li', null, h('span', 'pl-name', e.name), ': ', fig(e.amount_m, m1(e.amount_m.value)), `, ${e.note}.`))),
    h('h4', null, 'What is paid for'),
    p('This year’s budget for building projects (the ', gl('capital-improvements-program-cip', 'Capital Improvements Program'), ') is ',
      fig(f.cip_m, m1(f.cip_m.value)), '. About ', fig(f.water_sewer_pct, `${Math.round(f.water_sewer_pct.value)}%`), ' of it comes from the water and sewer ',
      gl('utility-enterprise-fund', 'utility funds'), ', which can be spent only on those systems. The biggest single items are the yearly programs that replace water mains (',
      fig(f.water_main_m, m1(f.water_main_m.value)), ') and sewer mains (', fig(f.sewer_main_m, m1(f.sewer_main_m.value)), '). ', what, ' shows where the rest goes.'),
    h('h4', null, 'How projects are chosen'),
    p('Under a Council rule (Council Policy 800-14), each project gets a score out of ', fig(inf.score_points, `${inf.score_points.value} points`),
      ', for things like legal and safety risk, the condition of what it replaces, and fairness across neighborhoods. ',
      cite(d.cites.restricted, 'Projects compete only with others paid from the same kind of restricted money, so a low-scoring project can still go ahead when it fits money that can’t be spent on anything else.')),
    steps,
    p('That is one reason money for one kind of project can’t simply move to another; ', claim, ' under Check a claim shows an example.'));
}

// ---- 4c. The pension ----
function payerColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  // Emphasis: the General Fund in its section 1 pot colour, the other funds in the two context greys (as in section 2).
  const fills = [v('--cat-1'), v('--cents-a'), v('--cents-b'), v('--cents-a'), v('--cents-b')];
  return { fills, ink: fills.map((f) => inkOn(f, v('--on-fill-light'), v('--on-fill-dark'))) };
}

function pension(barsEl, payersEl, copy, dig, d) {
  const pn = d.pension, c = d.cites;
  const prep = piles.preparePension(pn);
  const bars = h('div', 'pile-chart');
  barsEl.replaceChildren(h('p', 'pile-title', 'Retirement benefits promised, and money held, June 30, 2025'), bars,
    h('figcaption', 'chart-cap', 'The city’s own plan, as valued by the retirement system’s actuary. The gap is the ',
      gl('unfunded-liability', 'unfunded liability'), '.'));
  piles.renderPensionBars(bars, prep, { fig });
  const gf = pn.payers[0];
  const draw = () => {
    const col = payerColors();
    piles.renderPayers(payersEl, prep, {
      fig, colors: col.fills, ink: col.ink, shareFig: pn.gf_share_pct,
      title: ['Who pays this year’s pension payment (the ', gl('pension-adc', 'ADC'), ') of ', fig(pn.adc_total_m, m1(pn.adc_total_m.value))],
    });
    payersEl.append(h('p', 'chart-cap', 'The budget assigns ', fig(gf.amount_m, m1(gf.amount_m.value)), ', or ', fig(pn.gf_share_pct, `${Math.round(pn.gf_share_pct.value)}%`),
      ', to the General Fund and charges the rest to the city’s other funds, such as water and sewer. The budget documents we read don’t spell out how the split is worked out.'));
    mountPopovers(payersEl);
  };
  draw();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  copy.replaceChildren(
    p('Why it rose this year: ', cite(pn.rise_m.source, 'pay raises were bigger than the actuary had assumed'), ', which added ', fig(pn.rise_m, m1(pn.rise_m.value)), ' to the payment.'),
    p('Some relief is scheduled. The actuary projects ', fig(pn.fy2028_m, m1(pn.fy2028_m.value)), ' for FY2028 and then ', fig(pn.fy2029_m, m1(pn.fy2029_m.value)),
      ' for FY2029, ', cite(c.layers, 'as the city finishes paying off some older parts of the shortfall'), '.'),
    p(cite(c.full_funding, 'If everything goes as the actuary assumes, including investment returns of 6.5% every year, the fund would be fully paid up (100% funded) at the June 30, 2041 valuation'),
      '. Real results will differ.'));
  dig.replaceChildren(
    h('h4', null, 'What “held” means'),
    p(cite(c.smoothed, 'The actuary values the fund’s investments in a smoothed way, spreading one year’s gains or losses over several years.'),
      ' Counted at market value instead, the fund was ', fig(pn.market_funded_pct, `${pn.market_funded_pct.value.toFixed(1)}%`), ' funded (its ',
      gl('funded-ratio', 'funded ratio'), ').'),
    h('h4', null, 'The funds that pay'),
    p(cite(pn.adc_total_m.source, '“Utilities” are funds for services customers pay for directly, such as water and sewer (enterprise funds). “Money tied to a purpose” is special revenue funds. “Internal services” are funds that bill other city departments. “Other” includes the retirement system’s own staff.')));
}

// The one sentence that names last year's $6.51B: it says how the $1.3B growth was worked out.
function growth(el, d) {
  const inf = d.infrastructure;
  el.replaceChildren('That is about ', figureSpan(inf.growth_m, `$${(inf.growth_m.value / 1000).toFixed(1)}B`), ' more than a year earlier (our arithmetic: ',
    figureSpan(inf.gap_m, bn(inf.gap_m.value)), ' − ', figureSpan(inf.prior_gap_m, bn(inf.prior_gap_m.value)), ' in the previous year’s plan), ',
    cite(d.cites.gf_only_gap, 'mostly for stormwater'), '.');
}

export function renderPiles(root, d) {
  fillLeads(root, d);
  growth(root.querySelector('#s4-growth'), d);
  const $ = (id) => root.querySelector(`#${id}`);
  reserve($('s4-reserve'), $('s4-reserve-copy'), $('s4-reserve-dig'), d);
  const water = assets($('s4-assets'), d);
  $('s4-assets').after(water);
  roads($('s4-roads'), d);
  infraDig($('s4-infra-dig'), d);
  pension($('s4-pension'), $('s4-payers'), $('s4-pension-copy'), $('s4-pension-dig'), d);
  mountPopovers(root);
}
