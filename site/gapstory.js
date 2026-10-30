// Section 3: the gap and how it was closed. noteParts() and stepLabel() are pure (Node-testable);
// renderGapStory() fills the section's mounts from gap_story.json.
import { figureSpan, mountPopovers, h, fig as sourced, cite, isOurs } from './sources.js';
import { gapMoney } from './gapui.js';
import { moneyToken } from './format.js';
import * as waterfall from './charts/waterfall.js';
import * as timeline from './charts/gap-timeline.js';
import { themeColors, observeWidth } from './charts/util.js';

// The "what's coming" note as text and sourced parts: the city's figure becomes a .figure, the forecast date a cite.
// The build checks the note shows the figure as moneyToken() writes it and contains the cite anchor; if either is
// missing here the data and code disagree, so this throws (the section's guarded() render then says so on screen).
export const FORECAST_CITE_ANCHOR = 'A new forecast is due';
export function noteParts(coming) {
  const token = moneyToken(coming.city_m.value);
  const at = coming.note.indexOf(token);
  if (at < 0) throw new Error(`coming.note does not show the city's figure as ${token}`);
  const rest = coming.note.slice(at + token.length);
  const d = rest.indexOf(FORECAST_CITE_ANCHOR);
  if (d < 0) throw new Error(`coming.note has no "${FORECAST_CITE_ANCHOR}" after ${token}`);
  return [
    coming.note.slice(0, at),
    { kind: 'figure', text: token, figure: coming.city_m },
    rest.slice(0, d),
    { kind: 'cite', text: rest.slice(d), source: coming.forecast_due.source },
  ].filter((x) => x !== '');
}

// Copy with named cites: each {text, source} in cites becomes a cite on its first appearance in the text (in order).
// Throws when a cite's text is missing, as the build checks it is there.
export function citeParts(text, cites = []) {
  const out = [];
  let rest = text;
  for (const c of cites) {
    const at = rest.indexOf(c.text);
    if (at < 0) throw new Error(`cite text ${JSON.stringify(c.text)} not found in ${JSON.stringify(text)}`);
    out.push(rest.slice(0, at), { kind: 'cite', text: c.text, source: c.source });
    rest = rest.slice(at + c.text.length);
  }
  out.push(rest);
  return out.filter((x) => x !== '');
}

export const stepLabel = (b) => b.label; // the computed step says so in its footnote and by its hatching, not in words

// ---- DOM (browser only) ----
// A sourced figure in this section's money format; an our-arithmetic source says so on screen.
const fig = (f, text = gapMoney(f.value)) => sourced(f, text);
const OFFICE = { IBA: "The IBA (the Council's independent budget analyst)", City: "The city's budget office (the Mayor's Department of Finance)" };

function headlines(d) {
  const { this_year: ty, worst, coming } = d.headlines;
  const card = (cls, q, ...kids) => h('section', `hl-card${cls ? ` ${cls}` : ''}`, h('h3', 'hl-q', q), ...kids);
  const note = h('p', 'hl-note');
  for (const part of noteParts(coming)) {
    if (typeof part === 'string') note.append(part);
    else if (part.kind === 'figure') note.append(figureSpan(part.figure, part.text));
    else note.append(cite(part.source, part.text));
  }
  const sett = h('ul', 'hl-sett', ...coming.settlement.map((s) => h('li', null, h('span', null, s.label), ' ', fig(s.amount_m, `about ${gapMoney(s.amount_m.value)}`))));
  return h('div', 'hl-cards',
    card('', 'How big was it this year?',
      h('p', 'hl-num', fig(ty.value_m)),
      h('p', 'hl-what', ...citeParts(ty.counting, ty.cites).map((x) => (typeof x === 'string' ? x : cite(x.source, x.text))))),
    card('', 'How bad did it get?',
      h('p', 'hl-num', fig(worst.value_m)),
      h('p', 'hl-sub', `In FY${worst.fy}. Without the skipped deposits: `, fig(worst.without_reserve_m), '.'),
      h('p', 'hl-what', worst.counting)),
    card('hl-coming', 'What’s coming?',
      h('p', 'hl-fy', `FY${coming.fy}, measured two ways`),
      h('div', 'hl-pair',
        h('div', null, h('p', 'hl-num', fig(coming.city_m)), h('p', 'hl-who', coming.city_counting)),
        h('div', null, h('p', 'hl-num', fig(coming.iba_m)), h('p', 'hl-who', coming.iba_counting))),
      h('p', 'hl-sett-h', 'Costs from the 2026 trash and parking settlement, which the IBA listed separately and which are not added to either number, for FY2028:'),
      sett,
      note));
}

const KEY = [
  ['locked', 'The gap, and what is left of it'],
  ['gap', 'Added to it'],
  ['discretionary', 'Closed by the budget'],
];
function legend() {
  const ul = h('ul', 'legend wf-legend');
  for (const [role, text] of KEY) {
    const sw = h('span', 'swatch');
    sw.style.background = `var(--${role})`;
    ul.append(h('li', null, sw, text));
  }
  ul.append(h('li', null, h('span', 'swatch is-hatched'), 'Closed, not itemized by the IBA (hatched)'));
  return ul;
}

function stepItem(b, i) {
  const name = h('span', 'wf-name');
  const label = stepLabel(b);
  const pos = b.positions && label.indexOf(`${b.positions.value} positions`);
  if (b.positions && pos >= 0) {
    const tok = `${b.positions.value} positions`;
    name.append(label.slice(0, pos), figureSpan(b.positions, tok), label.slice(pos + tok.length));
  } else {
    name.textContent = label;
  }
  const sign = { up: '+ ', down: '− ' }[b.kind] ?? '';
  const sw = h('span', `swatch${b.ourArithmetic ? ' is-hatched' : ''}`);
  if (!b.ourArithmetic) sw.style.background = `var(--${waterfall.fillRole(b)})`;
  const val = h('span', 'wf-amt', sign, figureSpan(b.figure, b.figure.value === 0 ? '$0' : `$${b.figure.value.toFixed(1)}M`));
  return h('li', `wf-step wf-${b.kind}`, h('span', 'wf-n', String(i + 1)), sw, name, val);
}

function waterfallBlock(el, d) {
  const prep = waterfall.prepare(d.waterfall);
  const first = d.waterfall[0].amount_m;
  const plot = h('div', 'wf-plot');
  const steps = h('ol', 'wf-steps', ...prep.bars.map(stepItem));
  const fte = d.adopted_note.positions_change;
  const after = h('p', 'chart-cap wf-after', 'Council changed some cuts in June; the adopted budget ends with ',
    figureSpan(fte, String(Math.abs(fte.value))), ' fewer General Fund positions.');
  el.replaceChildren(
    h('h3', 'sub-h', 'How this year’s gap was closed'),
    h('p', 'chart-cap', cite(first.source, 'The steps in the Mayor’s proposed budget, as the IBA laid them out in April 2026'),
      '. Each bar is numbered to match the list below it.'),
    legend(), plot, steps, after);
  const aria = `Step chart. ${prep.bars.map((b, i) => `${i + 1}, ${stepLabel(b)}: ${waterfall.barValue(b, true)}`).join('. ')}.`;
  const draw = () => waterfall.render(plot, prep, themeColors(), {
    label: stepLabel,
    describe: (b) => (isOurs(b.figure.source) ? b.figure.source.doc : `Source: ${b.figure.source.doc}`),
    ariaLabel: aria,
  });
  observeWidth(plot, draw);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  mountPopovers(el);
}

function residual(el, d) {
  const r = d.residual;
  el.replaceChildren(
    h('h3', 'sub-h', 'What was left after the cuts'),
    h('p', null, 'The budget the Council adopted in June still uses ', fig(r.one_time_m), ' of one-time money. ',
      fig(r.one_time_uses_m), ' of it pays for one-time things. The other ', fig(r.ongoing_m),
      ' pays for ongoing costs, so that part is still a hole next year. This is the city budget office’s measure of the structural deficit.'),
    h('p', null, 'The budget also delayed the deposit of about ', fig(r.skipped_reserve_m),
      ' into the rainy-day reserve that the city’s own policy calls for. If that skipped deposit is counted as one-time money too, as the IBA counted it at the earlier stages, the hole is about ',
      fig(r.with_reserve_m, `$${Math.round(r.with_reserve_m.value)}M`),
      '. The IBA has not published a figure for the adopted budget counted that way; its figures for the earlier stages are under Dig deeper.'));
  mountPopovers(el);
}

function timelineBlock(el, d) {
  const r = d.residual;
  const dl = h('dl', 'gap-defs');
  for (const x of d.definitions) dl.append(h('dt', null, x.term), h('dd', null, cite(x.source, x.plain)));
  const plot = h('div', 'tl-host');
  el.replaceChildren(
    h('h3', 'sub-h', 'Why there are so many gap numbers'),
    h('p', null, 'The gap is measured at different moments and counted in different ways. Three terms do most of the work:'),
    dl,
    h('p', null, 'Each dot below is a gap figure that the city’s budget office or the IBA published, placed at the month it came out. Tap a dot, or move to it with the keyboard, to see who measured it, in which document, for which budget year, and what it counts. Where a dot shows two numbers, the second counts the skipped reserve deposit as one-time money.'),
    plot,
    h('p', null, 'The IBA’s own figures that count the skipped deposit are ', fig(r.iba_proposed_m), ' for the proposed budget (April) and ',
      fig(r.iba_may_m), ' after the Mayor’s May changes (June). The figure of about ', fig(r.with_reserve_m, `$${Math.round(r.with_reserve_m.value)}M`),
      ' above applies the same method to the city’s ', fig(r.ongoing_m), ' for the adopted budget; it is not an IBA figure.'));
  const prep = timeline.prepare(d.timeline);
  observeWidth(plot, (w) => {
    if (w <= 0) return; // inside a closed <details>; drawn on first open
    timeline.render(plot, prep, { figureSpan, money: gapMoney, officeName: (o) => OFFICE[o], mountPopovers });
  });
  mountPopovers(el);
}

export function renderGapStory(section, d) {
  const q = (id) => section.querySelector(`#${id}`);
  q('s3-headlines').replaceChildren(headlines(d));
  mountPopovers(q('s3-headlines'));
  waterfallBlock(q('s3-waterfall'), d);
  residual(q('s3-residual'), d);
  timelineBlock(q('s3-timeline'), d);
}
