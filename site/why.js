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

const pctText = (v) => `${String(v)}%`;
const centsWord = (v) => `${String(v)} ${v === 1 ? 'cent' : 'cents'}`;
const mText = (v) => (v >= 100 && Number.isInteger(v) ? `$${v}M` : `$${v.toFixed(1)}M`);
const votes = (v) => v.toLocaleString('en-US');
const months = (v) => String(v);

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
  const st = d.sales_tax, me = st.measure_e, ho = d.hotel, tr = d.trash, gr = d.growth, c = d.cites, p13 = d.prop13;
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
        fig(me.no_pct, pctText(me.no_pct.value)), ' no, a difference of ', fig(me.margin_votes, `${votes(me.margin_votes.value)} votes`), '.')),
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
