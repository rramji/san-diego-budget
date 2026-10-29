// Chapter 2 dig-deeper: where each kind of money flows. prepare() is pure (no DOM, no d3).
// render() uses the global d3 plus d3-sankey (registered on the d3 namespace).
import { money } from '../format.js';

// Within each column, General Fund money comes first, so its flows run along the top of the diagram.
const KIND_RANK = { discretionary: 0, utility: 1, restricted: 2, borrowed: 3 };

export function prepare(flows) {
  const nodes = flows.nodes.map((n) => ({ id: n.id, label: n.label, column: n.column, kind: n.kind }));
  nodes.sort((a, b) => (a.column - b.column) || ((KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9)));
  return {
    nodes,
    links: flows.links.map((l) => ({
      source: l.source, target: l.target, value: l.amount_m, rule: l.rule, ref: l.ref, highlight: !!l.highlight,
    })),
  };
}

export const linkKey = (l) => `${l.source.id ?? l.source}>${l.target.id ?? l.target}`;
export const linkLabel = (l) => `${l.source.label} → ${l.target.label}`;

const FONT = 11; // phone (vertical) layout
const WIDE_FONT = 13; // desktop (horizontal) layout
const CHAR = FONT * 0.56; // average glyph width estimate for the UI font

const trunc = (s, px) => {
  const max = Math.max(3, Math.floor(px / CHAR));
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};

// Wrap whole words into lines no wider than px, measured with measure(str) -> px. Words are never cut.
export function wrapMeasured(s, px, measure) {
  const out = [];
  let cur = '';
  for (const w of s.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || measure(next) <= px) cur = next;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

// Spread label blocks {mid, h} apart so none overlap, staying within [lo, hi] where possible. Returns the new
// centre of each block, in input order.
export function spreadLabels(blocks, lo, hi, gap = 2) {
  const order = blocks.map((b, i) => ({ ...b, i })).sort((a, b) => a.mid - b.mid);
  let y = lo;
  for (const b of order) { b.top = Math.max(b.mid - b.h / 2, y); y = b.top + b.h + gap; }
  let limit = hi;
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const b = order[k];
    if (b.top + b.h > limit) b.top = limit - b.h;
    limit = b.top - gap;
  }
  const out = [];
  for (const b of order) out[b.i] = b.top + b.h / 2;
  return out;
}

// Greedy label thinning: keep labels (priority first) whose centres sit at least `gap` px apart.
function pickLabels(nodes, center, priority, gap) {
  const kept = [];
  const order = [...nodes].sort((a, b) => (priority(b) - priority(a)) || (b.value - a.value));
  for (const n of order) if (kept.every((k) => Math.abs(center(k) - center(n)) >= gap)) kept.push(n);
  return new Set(kept);
}

export function render(el, data, colors, onSelect, opts = {}) {
  const d3 = window.d3;
  el.replaceChildren();
  const captions = opts.captions || [];
  const W = Math.max(280, Math.round(el.getBoundingClientRect().width || el.parentElement.clientWidth));
  const vertical = W < 600;
  const font = vertical ? FONT : WIDE_FONT;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${font}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'system-ui'}`;
  const measure = (str) => ctx.measureText(str).width;
  const kindColor = { utility: colors.locked, restricted: colors.restricted, discretionary: colors.discretionary, borrowed: colors.locked };
  // Borrowed money shares the "locked" colour, so its ribbons are striped to stay distinct from utility fees.
  const kindDash = { borrowed: '5 3' };
  const NODE_W = 14;
  const MIN_THICK = 3;

  // Layout in d3-sankey's horizontal geometry. In vertical mode the axes are swapped:
  // layout x (column axis) is drawn downward, layout y (within a column) is drawn rightward.
  let H, extent, m;
  if (vertical) {
    m = { top: 140, right: 4, bottom: 150, left: 4 };
    extent = [[0, 0], [430, W - m.left - m.right]];
    H = m.top + 430 + m.bottom;
  } else {
    // Side margins fit the longest label, up to a quarter of the width each; longer labels wrap.
    const longest = (col) => Math.max(0, ...data.nodes.filter((n) => n.column === col).map((n) => measure(n.label)));
    const cap = Math.round(W * 0.25);
    m = { top: 30, right: Math.min(cap, longest(2) + 16), bottom: 8, left: Math.min(cap, longest(0) + 16) };
    const inner = W >= 900 ? 580 : 470;
    extent = [[0, 0], [W - m.left - m.right, inner]];
    H = m.top + inner + m.bottom;
  }
  const layout = d3.sankey().nodeId((d) => d.id).nodeWidth(NODE_W).nodePadding(vertical ? 3 : 8)
    .nodeAlign((n) => n.column).nodeSort(null).linkSort(null).extent(extent).iterations(32);
  const graph = layout({
    nodes: data.nodes.map((n) => ({ ...n })),
    links: data.links.map((l) => ({ ...l })),
  });
  const nodes = graph.nodes;
  const links = graph.links;
  for (const l of links) l.width = Math.max(l.width, 2.5);

  // Geometry helpers: map layout coordinates to screen coordinates.
  const sx = (n) => (vertical ? n.y0 : n.x0);
  const sy = (n) => (vertical ? n.x0 : n.y0);
  const nodeBox = (n) => {
    if (vertical) {
      const w = Math.max(n.y1 - n.y0, MIN_THICK);
      return { x: n.y0 - (w - (n.y1 - n.y0)) / 2, y: n.x0, w, h: NODE_W, mid: (n.y0 + n.y1) / 2 };
    }
    const h = Math.max(n.y1 - n.y0, MIN_THICK);
    return { x: n.x0, y: n.y0 - (h - (n.y1 - n.y0)) / 2, w: NODE_W, h, mid: (n.y0 + n.y1) / 2 };
  };
  const linkPath = (l) => {
    if (!vertical) return d3.sankeyLinkHorizontal()(l);
    const a = l.source.x1; const b = l.target.x0; const mid = (a + b) / 2;
    return `M${l.y0},${a}C${l.y0},${mid} ${l.y1},${mid} ${l.y1},${b}`;
  };

  const wrapEl = document.createElement('div');
  wrapEl.className = 'sankey';
  const svg = d3.select(wrapEl).append('svg')
    .attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'group')
    .style('display', 'block').style('max-width', '100%').style('overflow', 'visible');
  const hl = links.find((l) => l.highlight);
  const nSrc = nodes.filter((n) => n.column === 0).length;
  const nUse = nodes.filter((n) => n.column === 2).length;
  svg.attr('aria-label', `Flow diagram: money from ${nSrc} sources flows through ${nodes.filter((n) => n.column === 1).length} kinds of rules into ${nUse} uses. Borrowed money (bonds) is drawn striped.${hl ? ` The highlighted flow is ${linkLabel(hl)}, ${money(hl.value)}.` : ''} Select a flow to read its rule and source below.`);

  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  // ribbons
  const rib = g.append('g').attr('class', 'ribbons');
  const sel = { key: null };
  const groups = [];
  for (const l of links) {
    const key = linkKey(l);
    const gr = rib.append('g').attr('class', `ribbon${l.highlight ? ' is-highlight' : ''}`).attr('tabindex', 0).attr('role', 'button')
      .attr('data-key', key)
      .attr('aria-label', `flow from ${l.source.label} to ${l.target.label}, ${money(l.value)}`);
    const d = linkPath(l);
    if (l.highlight) gr.append('path').attr('class', 'ribbon-hl').attr('d', d).attr('fill', 'none').attr('stroke', colors.gap).attr('stroke-width', l.width + 5).attr('stroke-opacity', 0.9);
    gr.append('path').attr('class', 'ribbon-sel').attr('d', d).attr('fill', 'none').attr('stroke', colors.text).attr('stroke-width', l.width + 3).attr('stroke-opacity', 0);
    gr.append('path').attr('class', 'ribbon-vis').attr('d', d).attr('fill', 'none')
      .attr('stroke', kindColor[l.source.kind]).attr('stroke-width', l.width).attr('stroke-opacity', 0.45)
      .attr('stroke-dasharray', kindDash[l.source.kind] || null);
    // wider invisible target for touch
    gr.append('path').attr('d', d).attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', Math.max(l.width, 16)).style('cursor', 'pointer');
    const choose = () => { select(l); if (onSelect) onSelect(l); };
    gr.on('click', choose).on('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); }
    });
    groups.push([key, gr]);
  }
  function select(l) {
    sel.key = linkKey(l);
    for (const [k, gr] of groups) {
      const on = k === sel.key;
      gr.classed('is-selected', on);
      gr.select('.ribbon-sel').attr('stroke-opacity', on ? 0.9 : 0);
      gr.select('.ribbon-vis').attr('stroke-opacity', on ? 0.8 : 0.45);
      gr.attr('aria-pressed', on ? 'true' : 'false');
    }
  }

  // nodes
  const hlNodes = new Set(hl ? [hl.source.id, hl.target.id] : []);
  for (const n of nodes) {
    const b = nodeBox(n);
    g.append('rect').attr('x', b.x).attr('y', b.y).attr('width', b.w).attr('height', b.h)
      .attr('fill', kindColor[n.kind]).attr('class', 'node')
      .append('title').text(`${n.label}: ${money(n.value)}`);
  }

  // labels
  const halo = { 'paint-order': 'stroke', stroke: 'var(--bg)', 'stroke-width': 3, 'stroke-linejoin': 'round' };
  const label = (parent) => {
    const t = parent.append('text').attr('fill', colors.text).style('font', `${font}px var(--font-ui)`).attr('pointer-events', 'none');
    for (const [k, v] of Object.entries(halo)) t.style(k, v);
    return t;
  };
  const prio = (n) => (hlNodes.has(n.id) ? 1 : 0);
  for (const col of [0, 1, 2]) {
    const cn = nodes.filter((n) => n.column === col);
    if (vertical) {
      if (col === 1) continue; // identified by the colour key above the chart and the flow list
      const keep = pickLabels(cn, (n) => (n.y0 + n.y1) / 2, prio, FONT + 3);
      for (const n of keep) {
        const b = nodeBox(n);
        const cx = b.x + b.w / 2;
        const up = col === 0;
        const t = label(g).attr('text-anchor', 'start')
          .attr('transform', `translate(${cx + FONT * 0.35},${up ? b.y - 5 : b.y + b.h + 5}) rotate(${up ? -90 : 90})`);
        t.text(trunc(n.label, up ? m.top - 30 : m.bottom - 8));
      }
    } else {
      // Every node gets its full label, wrapped to the space beside it; labels that would collide are spread
      // apart, with a short leader line back to their node.
      const LH = font + 3;
      const room = col === 1 ? (extent[1][0] - NODE_W * 3) / 2 - 12 : (col === 0 ? m.left : m.right) - 12;
      const blocks = cn.map((n) => {
        const lines = wrapMeasured(n.label, room, measure);
        return { n, b: nodeBox(n), lines, mid: nodeBox(n).mid, h: lines.length * LH };
      });
      const mids = col === 1 ? spreadLabels(blocks, 0, extent[1][1]) : spreadLabels(blocks, -m.top + 18, extent[1][1] + m.bottom);
      blocks.forEach(({ b, lines }, k) => {
        const left = col === 0;
        const x = left ? b.x - 6 : b.x + b.w + 6;
        const y = mids[k];
        if (Math.abs(y - b.mid) > 2) {
          const x2 = left ? x - 4 : x + 4;
          g.append('path').attr('d', `M${left ? b.x - 1 : b.x + b.w + 1},${b.mid}L${x2},${y}`)
            .attr('stroke', colors.muted).attr('stroke-width', 0.75).attr('fill', 'none');
        }
        const t = label(g).attr('text-anchor', left ? 'end' : 'start');
        lines.forEach((ln, i) => t.append('tspan').attr('x', Math.abs(y - b.mid) > 2 ? (left ? x - 6 : x + 6) : x)
          .attr('y', y + (i - (lines.length - 1) / 2) * LH).attr('dy', '0.35em').text(ln));
      });
    }
  }

  // column headings: drawn in the svg only in the horizontal layout. The vertical layout uses an HTML key instead,
  // so no text is drawn over ribbons.
  if (!vertical) {
    captions.slice(0, 3).forEach((cap, col) => {
      if (!cap) return;
      const n = nodes.find((x) => x.column === col);
      svg.append('text').attr('fill', colors.muted).style('font', `600 ${font + 1}px var(--font-ui)`).text(cap)
        .attr('y', 16).attr('text-anchor', col === 0 ? 'end' : col === 2 ? 'start' : 'middle')
        .attr('x', col === 0 ? m.left + n.x0 + NODE_W : col === 2 ? m.left + n.x0 : m.left + n.x0 + NODE_W / 2);
    });
  }
  // HTML key in both layouts: one entry per rule (column 1), coloured by kind; borrowed money also names its source.
  const key = document.createElement('div');
  key.className = 'sankey-key';
  if (vertical) {
    const ol = document.createElement('ol');
    ol.className = 'legend';
    ['Top', 'Middle', 'Bottom'].forEach((pos, col) => {
      if (!captions[col]) return;
      const li = document.createElement('li');
      li.textContent = `${pos}: ${captions[col]}`;
      ol.append(li);
    });
    key.append(ol);
  }
  key.append(kindLegend(data, kindColor));
  el.append(key);

  el.append(wrapEl);
  const initial = (opts.selected && links.find((l) => linkKey(l) === opts.selected)) || hl;
  if (initial) { select(initial); if (onSelect) onSelect(initial, { silent: true }); }
  return { select, vertical };
}

export const KIND_NAMES = {
  discretionary: 'General-purpose money', utility: 'Utility and enterprise fees', restricted: 'Grant- or law-restricted money', borrowed: 'Borrowed money',
};

// Legend entries: one per rule node, with the kind's name and, for borrowed money, the source node(s) feeding it.
export function kindEntries(data) {
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  return data.nodes.filter((n) => n.column === 1).map((rule) => {
    const srcs = data.links.filter((l) => (l.target.id ?? l.target) === rule.id).map((l) => byId[l.source.id ?? l.source]);
    const text = rule.kind === 'borrowed'
      ? `${KIND_NAMES.borrowed} (striped): ${srcs.map((n) => n.label).join(', ')} → ${rule.label}`
      : `${KIND_NAMES[rule.kind]}: ${rule.label}`;
    return { kind: rule.kind, text };
  });
}

function kindLegend(data, kindColor) {
  const lg = document.createElement('ul');
  lg.className = 'legend';
  for (const e of kindEntries(data)) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = e.kind === 'borrowed'
      ? `repeating-linear-gradient(90deg, ${kindColor[e.kind]} 0 5px, transparent 5px 8px)`
      : kindColor[e.kind];
    li.append(sw, e.text);
    lg.append(li);
  }
  return lg;
}

// Group links under the rule node they touch (every link touches exactly one), highlighted flow first.
export function groupFlows(data) {
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  return data.nodes.filter((n) => n.column === 1).map((rule) => ({
    rule,
    links: data.links.filter((l) => l.source === rule.id || l.target === rule.id)
      .sort((a, b) => (Number(b.highlight) - Number(a.highlight)) || (b.value - a.value))
      .map((l) => ({ ...l, sourceLabel: byId[l.source].label, targetLabel: byId[l.target].label })),
  }));
}

export default { prepare, render, linkKey, linkLabel, groupFlows, kindEntries };
