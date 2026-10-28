// Section 1 Dig deeper: "How we built this". The copy lives here; every number in it comes from budget_tree.json.
import { money } from './format.js';
import { figureSpan, mountPopovers } from './sources.js';

// The tree's rules (pipeline/categories.py, pipeline/budget_tree.py rulings R9/R10). tests/test_build.py checks
// these against the pipeline's constants, so the note can't drift from what the maps do.
export const RULES = { categories: 14, max_boxes: 10, category_min_m: 15.0, account_min_m: 50.0, fold_below_m: 0.05 };

const NO_FUND = "Not assigned to a fund in the city's data";
const CSV_DOC = 'City of San Diego open data: operating budget CSV';

const fig = (value, source, ours = false) => ({ text: money(value), value, source, ours });
const dollars = (m) => `$${Math.round(m * 1e6).toLocaleString('en-US')}`;

function findNode(n, key) {
  if (n.key === key) return n;
  for (const c of n.children ?? []) { const f = findNode(c, key); if (f) return f; }
  return null;
}

// Paragraphs as lists of strings and figures ({text, value, source, ours}).
export function methodsModel(tree) {
  const bar = `FY${tree.bar_fy}`;
  const detail = `FY${tree.detail_fy}`;
  const label = (id) => tree.pots.find((p) => p.id === id)?.label ?? id;
  const src = (k) => (k ? tree.sources[k] : null);
  const csvUrl = Object.values(tree.sources).find((s) => s.doc.startsWith(CSV_DOC))?.url;
  const paras = [];

  paras.push([
    `The bar of five pots is the ${bar} adopted budget. So are both ${label('cip')} maps, and the first level of both `
    + `${label('general_fund')} maps (the kinds of income, and the departments). The boxes below that first level, and every box in the `
    + `${label('utilities')}, ${label('purpose')} and ${label('internal')} maps, come from the city's open budget data, `
    + `whose latest year is ${detail}, so those maps add up to ${detail} totals rather than the bar's ${bar} amounts. `
    + 'Each map\'s header and each box\'s details say which year it shows.',
  ]);

  paras.push([
    `Spending is sorted into ${RULES.categories} plain categories, such as Salaries & other pay, Pension payment and Contracts & services. `
    + 'The city\'s data labels every dollar with an account group written for accountants, and one rule sorts every spending line, '
    + 'so the categories always add up to the total. Overtime and vehicle costs are picked out first, wherever the city files them. '
    + 'After that, the city\'s account group decides, and any group the rule doesn\'t name goes to Other costs, so nothing is dropped. '
    + 'Money coming in keeps the city\'s own names for its kinds of income. The city doesn\'t publish these categories itself: '
    + 'their sizes are our sorting of its labels.',
  ]);

  paras.push([
    `Small items in a map are grouped into an "Everything else" box: each level shows at most ${RULES.max_boxes} boxes, `
    + `the ${RULES.max_boxes - 1} largest and "Everything else". Smaller boxes don't open further. A fund or department opens into `
    + `categories only if it is at least ${money(RULES.category_min_m)}, and a category opens into the city's own accounts only if it is `
    + `at least ${money(RULES.account_min_m)}. Lines under ${dollars(RULES.fold_below_m)} are folded into "Everything else". `
    + 'A box that doesn\'t open still counts in full. A credit, such as the savings the city budgets because it expects some jobs to sit '
    + 'empty, is not drawn as a box: it is subtracted from the box it belongs to, and that box\'s details name it.',
  ]);

  const u = tree.unassigned;
  if (u) {
    const internal = tree.pots.find((p) => p.id === 'internal');
    const node = internal && findNode(internal.out, '_no_fund');
    const s = src(tree.descs?._no_fund?.src) || src(node?.src);
    paras.push([
      `In the city's ${detail} data, `, fig(u.value_m, s), ` of spending, listed under the department "${u.dept_name}", `
      + `isn't assigned to any fund, so we can't tell which pot it belongs to. Rather than leave it out, we show it as its own box, `
      + `"${NO_FUND}", in the ${label('internal')} money-out map.`,
    ]);
  }
  const um = tree.unmatched;
  if (um && um.rows > 0 && csvUrl) {
    const s = {
      doc: `our arithmetic: sum of the ${um.rows} ${detail} adopted rows of the city's operating budget CSV whose account number is not in the city's list of accounts`,
      page: null,
      url: csvUrl,
    };
    paras.push([
      `Another ${um.rows} rows of the ${detail} data, totaling `, fig(um.value_m, s, true), ' (our arithmetic), have no account number '
      + 'we can look up, so we can\'t tell whether they are spending or income. They are not drawn in any map.',
    ]);
  }

  paras.push([
    'Where a number on this page is our own sum or difference rather than one printed in a document, it is labeled '
    + '"our arithmetic", and its footnote shows the calculation.',
  ]);
  return { title: 'How we built this', paras };
}

export function renderMethods(el, tree) {
  const m = methodsModel(tree);
  const h = document.createElement('h3');
  h.className = 'sub-h';
  h.textContent = m.title;
  const ps = m.paras.map((parts) => {
    const p = document.createElement('p');
    p.append(...parts.map((x) => (typeof x === 'string' ? x : figureSpan({ value: x.value, source: x.source }, x.text))));
    return p;
  });
  el.classList.add('methods');
  el.replaceChildren(h, ...ps);
  mountPopovers(el);
}
