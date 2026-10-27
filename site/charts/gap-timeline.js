// Section 3 dig deeper: every gap figure on one date axis. prepare() is pure (importable in Node); render() lays the
// points down a vertical date axis (a phone column is too narrow for eight labels side by side) as an HTML list over
// an SVG axis, so each value is a sourced .figure and each dot is a real button with its own details.

const DAY = 86400000;
export const NEAR_DAYS = 45;

export function monthTime(date) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(date));
  if (!m) throw new Error(`timeline: bad date ${date}; YYYY-MM required`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, 1);
}

// timeline: gap_story.timeline. Points come back sorted by date (ties keep their input order). Two points within
// NEAR_DAYS of each other sit in different lanes (0/1); a point far from the one before it goes back to lane 0.
export function prepare(timeline) {
  const pts = timeline
    .map((e, i) => ({ e, i, t: monthTime(e.date) }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  let prev = null;
  const points = pts.map(({ e, t }) => {
    const lane = prev && t - prev.t <= NEAR_DAYS * DAY ? 1 - prev.lane : 0;
    const p = { ...e, t, lane, value_m: e.value_m.value, figure: e.value_m, figure2: e.value2_m ?? null };
    prev = p;
    return p;
  });
  const years = points.map((p) => new Date(p.t).getUTCFullYear());
  return { points, years: [Math.min(...years), Math.max(...years)] };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (t) => { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const monthsBetween = (a, b) => {
  const x = new Date(a); const y = new Date(b);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
};

// Vertical positions: proportional to time, except that a quiet stretch longer than BREAK_MONTHS is drawn shorter
// and marked as a break on the axis (with how long it really is), so the page doesn't carry a long empty column.
export const BREAK_MONTHS = 6;
export function layoutY(points, pxPerMonth, top = 0) {
  const dates = [...new Set(points.map((p) => p.t))];
  const y = new Map([[dates[0], top]]);
  const breaks = [];
  for (let i = 1; i < dates.length; i += 1) {
    const gap = monthsBetween(dates[i - 1], dates[i]);
    const drawn = gap > BREAK_MONTHS ? 3 : gap;
    const y0 = y.get(dates[i - 1]);
    y.set(dates[i], y0 + drawn * pxPerMonth);
    if (gap > BREAK_MONTHS) breaks.push({ y0, y1: y0 + drawn * pxPerMonth, months: gap });
  }
  return { y, breaks };
}

// ---- DOM (browser only) ----
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  return e;
};

const AXIS_X = 66;
const PX_PER_MONTH = 27;
const TOP = 14;
let openTip = null;

function closeTip(focusBack) {
  if (!openTip) return;
  const { tip, btn } = openTip;
  tip.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  if (focusBack) btn.focus();
  openTip = null;
}

let listening = false;
function listenOnce() {
  if (listening) return;
  listening = true;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openTip) closeTip(true); });
  document.addEventListener('click', (e) => { if (openTip && !openTip.li.contains(e.target)) closeTip(false); });
}

// opts: {figureSpan(fig, text) -> Node, money(v) -> string, officeName(office) -> string, mountPopovers(root)}
export function render(host, prep, opts) {
  listenOnce();
  if (openTip && host.contains(openTip.li)) openTip = null;
  const W = Math.max(280, Math.floor(host.getBoundingClientRect().width || 280));
  const colGap = 8;
  const colX = [AXIS_X + 14, 0];
  const colW = Math.min(210, Math.floor((W - colX[0] - colGap) / 2)); // columns stay near the axis on wide screens
  colX[1] = colX[0] + colW + colGap;
  const { y, breaks } = layoutY(prep.points, PX_PER_MONTH, TOP);

  const wrap = document.createElement('div');
  wrap.className = 'tl';
  const svg = svgEl('svg', { class: 'tl-svg', width: W, 'aria-hidden': 'true' });
  const list = document.createElement('ol');
  list.className = 'tl-list';
  wrap.append(svg, list);
  host.replaceChildren(wrap);

  const lastY = Math.max(...y.values());
  // the axis, cut where a quiet stretch is drawn shorter
  let from = TOP - 8;
  for (const b of breaks) {
    svg.append(svgEl('line', { x1: AXIS_X, x2: AXIS_X, y1: from, y2: b.y0 + 18, class: 'tl-axis' }));
    const mid = (b.y0 + b.y1) / 2;
    svg.append(svgEl('path', { d: `M${AXIS_X - 6},${mid - 4}l12,-4M${AXIS_X - 6},${mid + 4}l12,-4`, class: 'tl-break' }));
    const t = svgEl('text', { x: AXIS_X + 12, y: mid + 4, class: 'tl-break-text' });
    t.textContent = `${b.months} months`;
    svg.append(t);
    from = b.y1 - 18;
  }
  svg.append(svgEl('line', { x1: AXIS_X, x2: AXIS_X, y1: from, y2: lastY + 10, class: 'tl-axis' }));
  for (const [t, yy] of y) {
    const lab = svgEl('text', { x: AXIS_X - 12, y: yy + 4, 'text-anchor': 'end', class: 'tl-date' });
    lab.textContent = monthLabel(t);
    svg.append(lab);
  }

  let bottom = lastY;
  prep.points.forEach((p, i) => {
    const py = y.get(p.t);
    const li = document.createElement('li');
    li.className = `tl-pt lane-${p.lane}`;
    li.style.left = `${colX[p.lane]}px`;
    li.style.top = `${py - 11}px`;
    li.style.width = `${colW}px`;
    // lane 0 sits on the axis; lane 1 (same month) sits at the head of its own column, level with it
    const dotX = p.lane === 0 ? AXIS_X : colX[1] - 7;

    const who = opts.officeName(p.office);
    const values = p.figure2 ? `${opts.money(p.value_m)}, or ${opts.money(p.figure2.value)} counting the skipped reserve deposit` : opts.money(p.value_m);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tl-dot';
    btn.style.left = `${dotX - colX[p.lane] - 12}px`;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', `Details: ${values}, ${who}, ${monthLabel(p.t)}`);
    const tipId = `tl-tip-${i}`;
    btn.setAttribute('aria-controls', tipId);

    const v = document.createElement('p');
    v.className = 'tl-val';
    v.append(opts.figureSpan(p.figure, opts.money(p.value_m)));
    const label = [v];
    if (p.figure2) {
      const v2 = document.createElement('p');
      v2.className = 'tl-val2';
      v2.append('or ', opts.figureSpan(p.figure2, opts.money(p.figure2.value)));
      label.push(v2);
    }
    const meta = document.createElement('p');
    meta.className = 'tl-meta';
    meta.textContent = `${p.office}, for FY${p.describes_fy}`;
    label.push(meta);

    const tip = document.createElement('div');
    tip.className = 'tl-tip';
    tip.id = tipId;
    tip.hidden = true;
    const rows = [['Who', who], ['Document', p.doc_label], ['Describes', `FY${p.describes_fy}`], ['What it counts', p.counts]];
    const strong = document.createElement('strong');
    strong.textContent = values;
    const dl = document.createElement('dl');
    for (const [k, val] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = val;
      dl.append(dt, dd);
    }
    tip.append(strong, dl);

    const open = () => {
      if (openTip?.btn === btn) return;
      closeTip(false);
      tip.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      openTip = { tip, btn, li };
      // keep the details inside the chart column
      const tw = Math.min(280, W - 8);
      const left = Math.min(0, W - colX[p.lane] - tw);
      tip.style.left = `${left}px`;
      tip.style.width = `${tw}px`;
    };
    btn.addEventListener('click', () => { if (openTip?.btn === btn) closeTip(false); else open(); });
    btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) open(); });
    li.addEventListener('focusout', (e) => { if (!li.contains(e.relatedTarget) && openTip?.btn === btn) closeTip(false); });
    li.append(btn, ...label, tip);
    list.append(li);
  });
  opts.mountPopovers(list); // before measuring: the footnote buttons take room
  for (const li of list.children) bottom = Math.max(bottom, li.offsetTop + li.offsetHeight);
  const H = Math.ceil(bottom + 12);
  wrap.style.height = `${H}px`;
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
}
