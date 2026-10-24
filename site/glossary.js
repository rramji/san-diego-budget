// Plain-English glossary: anchors g-<slug>, inline term links, and a "back to where you were" link.
export const slug = (term) => term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Each entry ends with a return link. It points at the masthead until a reader follows a term
// link, then at that link, so a phone reader lands back in the sentence they left.
export function renderGlossary(el, glossary) {
  el.replaceChildren();
  for (const { term, plain } of glossary) {
    const id = `g-${slug(term)}`;
    const dt = document.createElement('dt');
    dt.id = id;
    dt.tabIndex = -1;
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.append(plain, ' ');
    const back = document.createElement('a');
    back.className = 'g-back';
    back.href = '#top';
    back.textContent = 'Back to the story';
    dd.append(back);
    el.append(dt, dd);
  }
}

let wired = false;
let n = 0;
export function wireGlossaryLinks(root = document) {
  root.querySelectorAll('a.gl[href^="#g-"]').forEach((a) => { if (!a.id) { n += 1; a.id = `gl-ref-${n}`; } });
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a.gl[href^="#g-"]');
    if (!a) return;
    if (!a.id) { n += 1; a.id = `gl-ref-${n}`; }
    const dt = document.getElementById(a.getAttribute('href').slice(1));
    const back = dt && dt.nextElementSibling && dt.nextElementSibling.querySelector('.g-back');
    if (back) back.href = `#${a.id}`;
  });
}

// Wrap the first match of each pattern in a text string with a glossary link; returns nodes.
export function linkTerms(text, patterns) {
  const hits = [];
  for (const [re, s] of patterns) {
    const m = re.exec(text);
    if (m && !hits.some((h) => m.index < h.end && h.start < m.index + m[0].length)) {
      hits.push({ start: m.index, end: m.index + m[0].length, s });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const out = [];
  let at = 0;
  for (const h of hits) {
    out.push(text.slice(at, h.start));
    const a = document.createElement('a');
    a.className = 'gl';
    a.href = `#g-${h.s}`;
    a.textContent = text.slice(h.start, h.end);
    out.push(a);
    at = h.end;
  }
  out.push(text.slice(at));
  return out.filter((x) => x !== '');
}
