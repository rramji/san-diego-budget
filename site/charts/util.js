// Shared chart helpers. DOM is touched only when these functions are called,
// so modules importing this file stay loadable in Node.
const ROLES = ['locked', 'restricted', 'discretionary', 'gap', 'text', 'muted', 'bg'];

export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const r of ROLES) out[r] = cs.getPropertyValue(`--${r}`).trim();
  return out;
}

// Calls cb(width) now, whenever el's width changes, and when the theme changes (so a chart drawn with themeColors()
// takes the new colours). Returns a disconnect function.
export function observeWidth(el, cb) {
  let last = -1;
  const fire = (w) => { w = Math.round(w); if (w !== last) { last = w; cb(w); } };
  const ro = new ResizeObserver((entries) => fire(entries[0].contentRect.width));
  ro.observe(el);
  fire(el.getBoundingClientRect().width);
  const retheme = () => { if (last > 0) cb(last); };
  document.addEventListener('themechange', retheme);
  return () => { ro.disconnect(); document.removeEventListener('themechange', retheme); };
}
