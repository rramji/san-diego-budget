import { money, pct, perPerson, cents, monthly } from './format.js';
import { compute } from './gapcalc.js';
import { figureSpan, mountPopovers, fig, cite, OURS_PREFIX } from './sources.js';

const OPTIONS = [
  { mode: 'pre_cut', text: "Before this year's cuts" },
  { mode: 'post_cut', text: "After this year's cuts" },
];

const HEADINGS = {
  Both: "The city's budget office and the IBA",
  'City budget office': "The city's budget office",
  'Our arithmetic': 'Counting the skipped reserve deposit too',
};

// The calculator's rows are our own arithmetic on the gap; each says so on screen.
const derived = (how, src) => ({ source: { doc: `${OURS_PREFIX}${how}`, page: src.page ?? null, url: src.url } });
// Gap amounts keep their stated precision ($23.1M, $80.1M); format.money would round them to $23M.
export const gapMoney = (m) => (m >= 1000 ? money(m) : `$${Number(m.toFixed(1))}M`);

function column(f, gap) {
  const col = document.createElement('section');
  col.className = 'gap-col';
  const h = document.createElement('h3');
  h.className = 'gap-framing';
  h.textContent = HEADINGS[f.framing] || f.framing;
  const big = document.createElement('p');
  big.className = 'gap-amount';
  const amt = fig({ source: f.sources.amount }, f.approx ? `about ${money(f.amount_m)}` : gapMoney(f.amount_m));
  big.append(amt, ' a year');
  col.append(h, big);
  const s = f.sources;
  const rows = [];
  const pp = perPerson(f.amount_m, gap.population.value);
  const hh = `$${Math.round(f.perHousehold).toLocaleString('en-US')} per household per year`;
  rows.push(
    ['Spread across residents', derived('the gap divided by the city population (California Department of Finance, Jan. 1, 2026)', s.population), pp],
    ['Spread across households', derived('the gap divided by the number of households (California Department of Finance, Jan. 1, 2026)', s.households), hh],
    ['As a sales tax increase', derived("the gap divided by what the city's 1% share of sales tax raises", s.sales_tax), cents(f.amount_m, gap.sales_tax_1pct_m.value)],
    ['As a flat monthly fee', derived('the per-household yearly amount divided by 12', s.households), `${monthly(f.monthlyFeePerHousehold)} per household`],
  );
  const dl = document.createElement('dl');
  dl.className = 'gap-rows';
  for (const [k, f2, text] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.append(fig(f2, text));
    dl.append(dt, dd);
  }
  col.append(dl);
  const cmp = document.createElement('p');
  cmp.className = 'gap-compare';
  const share = derived('the gap divided by the General Fund spending the Council can cut (the last bar of the funnel)', s.cuttable);
  cmp.append(
    'Closing it with cuts alone means cutting about one dollar in ',
    figureSpan(share, String(f.oneDollarIn)), ' (', figureSpan(share, pct(f.shareOfCuttable)),
    ') from the General Fund services the Council can cut (the last bar of the funnel under Dig deeper; our arithmetic).',
  );
  col.append(cmp);
  return col;
}

export function mountGapToggle(el, gap) {
  el.replaceChildren();
  let mode = 'pre_cut';
  const group = document.createElement('div');
  group.className = 'seg';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Which version of the gap');
  const btns = OPTIONS.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-opt';
    b.setAttribute('role', 'radio');
    b.textContent = o.text;
    b.dataset.mode = o.mode;
    return b;
  });
  group.append(...btns);
  const body = document.createElement('div');
  body.className = 'gap-body';
  body.setAttribute('aria-live', 'polite');
  const reserve = document.createElement('p');
  reserve.className = 'gap-reserve';
  const note = document.createElement('p');
  note.className = 'gap-note';
  note.textContent = 'A sales tax increase would need voter approval.';

  const render = () => {
    const { figures } = compute(gap, mode);
    btns.forEach((b) => {
      const on = b.dataset.mode === mode;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const cols = document.createElement('div');
    cols.className = `gap-cols n${figures.length}`;
    cols.append(...figures.map((f) => column(f, gap)));
    body.replaceChildren(cols);
    reserve.hidden = mode !== 'post_cut';
    reserve.replaceChildren();
    if (mode === 'post_cut') {
      const EXEC = { doc: 'FY2027 Adopted Budget Vol. I, Executive Summary, Financial Outlook and Stability: the budget continues to delay the planned General Fund reserve contribution', page: 5, url: 'https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1executivesummary.pdf' };
      const IBA = { doc: "IBA Report 26-11, Key Citywide Issues: Structural Budget Deficit (Reserve Policy targets; suspended reserve contributions treated as a one-time resource)", page: 78, url: 'https://www.sandiego.gov/sites/default/files/2026-04/iba-report-26-11-review-of-the-fiscal-year-2027-proposed-budget_0.pdf' };
      reserve.append(
        'Why two numbers? ',
        cite(IBA, "The city's Reserve Policy sets a savings target for its rainy-day fund"),
        '. The FY2027 budget delayed almost all of the deposit needed to reach it (',
        figureSpan(gap.skipped_reserve_m, gapMoney(gap.skipped_reserve_m.value)), '). ',
        cite(EXEC, 'The budget describes this as delaying the deposit'),
        '. Nothing was borrowed, but the savings stay below target until the city catches up. ',
        cite(IBA, 'That is why the IBA counts the skipped deposit as one-time money the budget is living on'), '.',
      );
    }
    mountPopovers(body);
    mountPopovers(reserve);
  };
  const select = (m, focus) => {
    mode = m;
    render();
    if (focus) btns.find((b) => b.dataset.mode === m).focus();
  };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => select(b.dataset.mode, false));
    b.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (step) {
        e.preventDefault();
        select(OPTIONS[(i + step + OPTIONS.length) % OPTIONS.length].mode, true);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        select(b.dataset.mode, false);
      }
    });
  });
  el.append(group, body, reserve, note);
  render();
}
