// Shared chart helpers. DOM is touched only when these functions are called,
// so modules importing this file stay loadable in Node.
const ROLES = ['locked', 'restricted', 'discretionary', 'gap', 'text', 'muted'];

export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const r of ROLES) out[r] = cs.getPropertyValue(`--${r}`).trim();
  return out;
}

// Calls cb(width) now and whenever el's width changes. Returns a disconnect function.
export function observeWidth(el, cb) {
  let last = -1;
  const fire = (w) => { w = Math.round(w); if (w !== last) { last = w; cb(w); } };
  const ro = new ResizeObserver((entries) => fire(entries[0].contentRect.width));
  ro.observe(el);
  fire(el.getBoundingClientRect().width);
  return () => ro.disconnect();
}
