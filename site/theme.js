// Light/dark theme: follows the system unless the reader picks one with the toggle. resolveTheme() and nextTheme()
// are pure (Node-testable); mountThemeToggle() wires the button, and onThemeChange() lets charts redraw.
const KEY = 'theme';
const listeners = [];

export const resolveTheme = (stored, prefersDark) => (stored === 'dark' || stored === 'light' ? stored : prefersDark ? 'dark' : 'light');
export const nextTheme = (current) => (current === 'dark' ? 'light' : 'dark');

export function onThemeChange(cb) {
  listeners.push(cb);
  return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
}

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');
export const currentTheme = () => resolveTheme(document.documentElement.dataset.theme, mq().matches);

function notify(theme) {
  listeners.forEach((cb) => cb(theme));
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

function label(btn, theme) {
  const to = nextTheme(theme);
  btn.setAttribute('aria-label', `Switch to ${to} mode`);
  btn.title = `Switch to ${to} mode`;
}

export function mountThemeToggle(btn) {
  if (!btn) return;
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage blocked: the toggle still works for this visit */ }
  const start = resolveTheme(stored, mq().matches);
  if (stored === 'dark' || stored === 'light') document.documentElement.dataset.theme = stored; // index.html set it early too
  label(btn, start);
  btn.addEventListener('click', () => {
    const theme = nextTheme(currentTheme());
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
    label(btn, theme);
    notify(theme);
  });
  // The system changes and the reader hasn't chosen: the page follows, and charts redraw.
  mq().addEventListener('change', (e) => {
    if (document.documentElement.dataset.theme) return;
    const theme = e.matches ? 'dark' : 'light';
    label(btn, theme);
    notify(theme);
  });
}
