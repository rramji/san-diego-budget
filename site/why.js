// Section 2: why a wealthy city is short. rateBars() is pure (Node-testable); renderWhy() fills the section's mounts.
import { figureSpan, mountPopovers, h, fig, cite } from './sources.js';
import * as centsBar from './charts/cents-bar.js';
import { observeWidth } from './charts/util.js';

// Sales-tax rates as HTML bars, highest first; widths are a share of the highest rate (bars start at zero).
export function rateBars(peers) {
  const max = Math.max(...peers.map((p) => p.rate_pct.value));
  return [...peers]
    .sort((a, b) => b.rate_pct.value - a.rate_pct.value || a.city.localeCompare(b.city))
    .map((p) => ({ city: p.city, rate: p.rate_pct.value, pct: (p.rate_pct.value / max) * 100, figure: p.rate_pct, highlight: p.city === 'San Diego' }));
}

// County cities' sales-tax rates, highest first, each split into the countywide base and the city's own add-on.
// Widths are shares of the highest total (bars start at zero).
// The November 3, 2026 measures: what each would raise, what that is per resident, and where the money would go.
export const shareText = (sh) => `${sh.cap ? 'up to ' : ''}${pctText(sh.pct.value)}`; // the figure; the label follows as plain text
export function ballotParas(b) {
  if (!b) return [];
  const co = b.county, sa = b.santee;
  const popM = (p) => `${(p.value / 1e6).toFixed(2)} million`;
  return [
    h('p', 'ballot-note', `The County estimates that ${co.measure} would raise `, fig(co.est_low_m, mText(co.est_low_m.value)), ' to ',
      fig(co.est_high_m, mText(co.est_high_m.value)), ' a year, ', cite(co.cites.question, 'with no end date'), '. Spread over the county’s ',
      fig(co.population, popM(co.population)), ' residents, that is about ', fig(co.per_resident_low, `$${co.per_resident_low.value}`), ' to ',
      fig(co.per_resident_high, `$${co.per_resident_high.value}`), ' per person per year, though visitors and businesses pay part of any sales tax. ',
      cite(co.cites.county_fund, 'The money would go to the County of San Diego, not to cities'), ': its spending plan allows ',
      ...co.shares.flatMap((sh, i) => [i ? (i === co.shares.length - 1 ? ', and ' : ', ') : '', fig(sh.pct, shareText(sh)), ` for ${sh.label}`]),
      '. None of it would flow into the City of San Diego’s budget.'),
    h('p', 'ballot-note', `Santee’s ${sa.measure}, a one-cent tax for `, fig(sa.years, `${sa.years.value} years`), ', is estimated to raise about ',
      fig(sa.est_m, `$${sa.est_m.value}M`), ' a year for that city, about ', fig(sa.per_resident, `$${sa.per_resident.value}`), ' per Santee resident, ',
      cite(sa.cites.uses, 'for streets, storm drains, and fire and emergency services'), '.'),
  ];
}

export function countyBars(county) {
  const rows = county.cities.map((c) => ({
    city: c.city, total: c.rate_pct.value, addon: c.addon_pct?.value ?? 0, figure: c.rate_pct, addonFigure: c.addon_pct ?? null,
  }));
  const max = Math.max(...rows.map((r) => r.total));
  return rows
    .sort((a, b) => b.total - a.total || a.city.localeCompare(b.city))
    .map((r) => ({ ...r, basePct: ((r.total - r.addon) / max) * 100, addonPct: (r.addon / max) * 100, highlight: r.city === 'San Diego' }));
}

const pctText = (v) => `${String(v)}%`;
const centsWord = (v) => `${String(v)} ${v === 1 ? 'cent' : 'cents'}`;
const mText = (v) => (v >= 100 && Number.isInteger(v) ? `$${v}M` : `$${v.toFixed(1)}M`);
const votes = (v) => v.toLocaleString('en-US');
const months = (v) => String(v);

function countyList(county) {
  const ul = h('ul', 'county-bars');
  ul.setAttribute('aria-label', `Total sales tax rate in each San Diego County city, ${county.effective}`);
  ul.append(h('li', 'cb-head', h('span', null, 'City'), h('span', null, ''), h('span', 'cb-val', 'Total'), h('span', 'cb-add-val', 'Own tax')));
  for (const r of countyBars(county)) {
    const base = h('span', 'cb-base');
    base.style.width = `${r.basePct}%`;
    const track = h('span', 'cb-track', base);
    if (r.addon) {
      const add = h('span', 'cb-add');
      add.style.width = `${r.addonPct}%`;
      track.append(add);
    }
    ul.append(h('li', r.highlight ? 'is-hi' : null,
      h('span', 'cb-city', r.city),
      track,
      h('span', 'cb-val', figureSpan(r.figure, `${r.total.toFixed(2)}%`)),
      h('span', 'cb-add-val', r.addonFigure ? figureSpan(r.addonFigure, `+${pctText(r.addon)}`) : 'none')));
  }
  return ul;
}

const block = (title, ...paras) => h('section', 'why-block', h('h3', null, title), ...paras.map((kids) => h('p', null, ...kids)));

function rateList(d) {
  const ul = h('ul', 'rate-bars');
  ul.setAttribute('aria-label', 'Total sales tax rate, October 1, 2026');
  for (const r of rateBars(d.sales_tax.peers)) {
    const bar = h('span', 'rb-bar');
    bar.style.width = `${r.pct}%`;
    const li = h('li', r.highlight ? 'is-hi' : null,
      h('span', 'rb-city', r.city),
      h('span', 'rb-track', bar),
      h('span', 'rb-val', figureSpan(r.figure, pctText(r.rate))));
    ul.append(li);
  }
  return ul;
}

export function blocks(d) {
  const st = d.sales_tax, me = st.measure_e, co = st.county, ho = d.hotel, tr = d.trash, gr = d.growth, c = d.cites, p13 = d.prop13;
  const quote = h('blockquote', 'why-quote',
    h('p', null, `“…${d.quote.text}”`),
    h('footer', null, '— ', cite(d.quote.source, 'IBA Report 26-11, April 2026')));
  return [
    block('Property tax: capped since 1978',
      ['Property tax is the city’s biggest source of general-purpose money: ', fig(d.property_tax_m, mText(d.property_tax_m.value)),
        ' in FY2027, or ', fig(d.property_tax_share_pct, pctText(d.property_tax_share_pct.value)), ' of the General Fund. But under ',
        cite(c.prop13_year, 'Proposition 13, which California voters approved in 1978'), ', the basic tax is ',
        fig(p13.rate_pct, pctText(p13.rate_pct.value)), ' of a property’s taxable value (assessed value), and that value can rise by at most ',
        fig(p13.cap_pct, pctText(p13.cap_pct.value)), ' a year until the property is sold, however fast prices climb.']),
    h('section', 'why-block', h('h3', null, 'Sales tax: one cent of each dollar'),
      h('p', null, 'Sales tax in San Diego is ', fig(st.sd_rate_pct, pctText(st.sd_rate_pct.value)), ' of the price of most goods. Of that, the city gets ',
        fig(st.city_cents_of_rate, centsWord(st.city_cents_of_rate.value)), ' for every dollar spent, or 1% of the price, not 1 cent per purchase; ',
        cite(c.sales_split, 'the rest goes to the state and to county and regional programs'),
        '. San Diego’s total rate is lower than in five other large California cities:'),
      rateList(d),
      h('p', 'chart-cap', cite(c.peers_note, 'These are the total rates charged at the register. They include state and county taxes, so not all of a higher rate goes to that city.')),
      h('p', null, 'In November 2024, a measure to add one more cent per dollar (Measure E), which the city estimated would raise about ',
        fig(me.est_annual_m, mText(me.est_annual_m.value)), ' a year, failed: ', fig(me.yes_pct, pctText(me.yes_pct.value)), ' voted yes and ',
        fig(me.no_pct, pctText(me.no_pct.value)), ' no, a difference of ', fig(me.margin_votes, `${votes(me.margin_votes.value)} votes`), '.'),
      h('h4', 'why-sub', 'Other cities in the county add their own'),
      h('p', null, 'Every city in San Diego County charges at least ', fig(co.unincorporated_pct, pctText(co.unincorporated_pct.value)),
        ': the statewide ', fig(co.state_pct, pctText(co.state_pct.value)), ' plus ', fig(co.transnet_pct, pctText(co.transnet_pct.value)),
        ' for regional transportation (', cite(co.cites.transnet_name, 'TransNet'), ') that applies countywide. On top of that, ',
        fig(co.n_addon, String(co.n_addon.value)), ' of the county’s 18 cities have added a sales tax of their own, of half a cent to a cent per dollar. The City of San Diego is one of ',
        fig(co.n_none, String(co.n_none.value)), ' that have not.'),
      countyList(co),
      h('p', 'chart-cap', `Total rate charged at the register, effective ${co.effective}. Grey: the countywide rate. Teal: the city’s own tax. Unincorporated areas of the county pay `,
        fig(co.unincorporated_pct, pctText(co.unincorporated_pct.value)), '.'),
      h('p', null, 'On November 3, 2026, county voters decide on ', cite(co.cites.ballot_county, 'a countywide half-cent sales tax (Measure B)'),
        ', which would apply in every city, San Diego included, and Santee voters on ', cite(co.cites.ballot_santee, 'a one-cent city sales tax (Measure Y)'), '.'),
      ...ballotParas(co.ballot)),
    block('Hotel tax: part of it goes to promoting tourism',
      ['Hotel guests pay a base hotel tax (transient occupancy tax) of ', fig(ho.base_cents, centsWord(ho.base_cents.value)),
        ' per dollar of rent, and city law sends ', fig(ho.gf_cents, centsWord(ho.gf_cents.value)), ' of it (', fig(ho.gf_m, mText(ho.gf_m.value)),
        ' in FY2027) to the General Fund. Of the rest, ', fig(ho.promo_cents, centsWord(ho.promo_cents.value)),
        ' go to promoting tourism, some of it paid back to the General Fund for costs such as safety and upkeep around visitor sites, and ',
        fig(ho.council_cents, centsWord(ho.council_cents.value)), ' can go to any purpose the City Council approves.'],
      [cite(c.measure_c, 'A further hotel tax that voters approved in March 2020 (Measure C), collected since May 2025, can pay only for the Convention Center and homelessness programs, and from November 2030 also street repair.')]),
    block('Trash pickup: free for a century',
      [cite(c.peoples_ordinance, 'From 1919 until 2025, a voter-approved law (the People’s Ordinance) had the city pick up trash from most single-family homes for free'),
        ', paid for by the General Fund. ', cite(c.fee_adopted, 'A fee approved in June 2025'), ' (', fig(tr.fee_monthly, `$${tr.fee_monthly.value.toFixed(2)} a month`),
        ' in FY2026 for the standard three 95-gallon bins) moved ', fig(tr.moved_m, mText(tr.moved_m.value)), ' of costs and ',
        fig(tr.positions, `${tr.positions.value} positions`), ' off the General Fund in FY2026.'],
      [cite(c.settlement, 'A lawsuit settlement the City Council approved on June 8, 2026 lowers the fee from July 2027'),
        ', so the General Fund will again pay part of the cost: about ', fig(tr.settlement_gf_fy2028_m, mText(tr.settlement_gf_fy2028_m.value)),
        ' in FY2028, by an estimate the Council’s Independent Budget Analyst (IBA) made before the vote.']),
    block('Costs grow faster than income',
      ['The IBA projects that the city’s regular General Fund income will grow about ', fig(gr.revenue_pct, pctText(gr.revenue_pct.value)),
        ` a year over ${gr.revenue_period}. Over ${gr.inflation_period}, prices in the San Diego area rose an average of `,
        fig(gr.inflation_pct, pctText(gr.inflation_pct.value)), ' a year. The two figures cover different years; the IBA puts them side by side as a sign that income growth keeps slowing, while ',
        cite(c.costs, 'the cost of staff, contracts and supplies has kept pace with inflation or exceeded it'), '.']),
    h('section', 'why-block', h('h3', null, 'In the IBA’s words'), quote),
  ];
}

export function dig(d) {
  const p13 = d.prop13, tr = d.trash;
  const cities = d.property_dollar.slices.filter((s) => s.group === 'Cities');
  return [
    h('h3', null, 'Why tax income trails home prices'),
    h('p', null, 'The county sets each property’s value as of January 1, but the bills are paid that December and the next April. So the city’s property-tax income reflects the housing market about ',
      fig(p13.lag_low_months, months(p13.lag_low_months.value)), ' to ', fig(p13.lag_high_months, `${months(p13.lag_high_months.value)} months`), ' late.'),
    h('h3', null, 'The cities’ share, in two parts'),
    h('p', null, 'The County’s chart splits the cities’ share into ', fig(cities[0].cents, `${cities[0].cents.value.toFixed(1)}¢`),
      ' of regular property tax and ', fig(cities[1].cents, `${cities[1].cents.value.toFixed(1)}¢`),
      ' that the state sends through property tax in place of car-registration fees (vehicle license fees), a swap made in 2004.'),
    h('h3', null, 'The 2026 trash settlement'),
    h('p', null, 'From July 1, 2027, the monthly fee for the standard 95-gallon bundle drops to ', fig(tr.settlement_fee_monthly, `$${tr.settlement_fee_monthly.value.toFixed(2)}`),
      ', and the city has dropped planned weekly recycling and bulky-item pickup. In a June 2, 2026 report on the settlement the Council had tentatively approved on May 20, the IBA estimated that the trash fund would collect ',
      fig(tr.settlement_revenue_cut_fy2028_m, mText(tr.settlement_revenue_cut_fy2028_m.value)), ' less in FY2028, and that after savings the General Fund would pay about ',
      fig(tr.settlement_gf_fy2028_m, mText(tr.settlement_gf_fy2028_m.value)), ' in FY2028 and ', fig(tr.settlement_gf_fy2029_m, mText(tr.settlement_gf_fy2029_m.value)),
      ' in FY2029.'),
  ];
}

// Fill [data-why-fig="a.b.c"] placeholders (the lead) with sourced figures.
function fillLead(root, d) {
  const fmt = {
    'property_dollar.cities_cents': (v) => `${v.toFixed(1)}¢`,
    'sales_tax.city_cents_of_rate': (v) => centsWord(v),
    'sales_tax.sd_rate_pct': pctText,
    'hotel.gf_cents': (v) => v.toFixed(1),
    'hotel.base_cents': (v) => v.toFixed(1),
  };
  for (const sp of root.querySelectorAll('[data-why-fig]')) {
    const key = sp.dataset.whyFig;
    const f = key.split('.').reduce((o, k) => o?.[k], d);
    if (!f?.source) throw new Error(`why-short lead: no figure at ${key}`);
    sp.replaceWith(fig(f, (fmt[key] ?? String)(f.value)));
  }
}

function centsColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { hi: v('--gap'), a: v('--cents-a'), b: v('--cents-b'), light: v('--on-fill-light'), dark: v('--on-fill-dark') };
}

export function renderWhy(el, d) {
  fillLead(el, d);
  const centsEl = el.querySelector('#s2-cents');
  const prep = centsBar.prepare(d.property_dollar);
  const p13 = d.prop13;
  const draw = () => {
    centsBar.render(centsEl, prep, centsColors(), {
      figureSpan,
      caption: d.property_dollar.note,
      title: ['Where each dollar of the basic ', fig(p13.rate_pct, pctText(p13.rate_pct.value)), ' property tax goes, countywide'],
    });
    mountPopovers(centsEl);
  };
  observeWidth(centsEl, draw);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  const blocksEl = el.querySelector('#s2-blocks');
  blocksEl.replaceChildren(...blocks(d));
  mountPopovers(blocksEl);
  const digEl = el.querySelector('#s2-dig');
  digEl.replaceChildren(...dig(d));
  mountPopovers(digEl);
}
