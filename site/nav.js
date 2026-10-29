// Sticky section bar. currentSection() is pure; mountSectionBar() wires it to scrolling.

// The id of the last section whose top is at or above y (page coordinates), or null above the first.
export function currentSection(tops, y) {
  let cur = null;
  for (const [id, top] of tops) if (top <= y) cur = id; else break;
  return cur;
}

export function mountSectionBar() {
  const bar = document.getElementById('secbar');
  if (!bar) return;
  const strip = bar.querySelector('ul');
  const links = [...bar.querySelectorAll('a[href^="#"]')];
  let ticking = false;
  const update = () => {
    ticking = false;
    const tops = links.map((a) => [a.getAttribute('href').slice(1), document.getElementById(a.getAttribute('href').slice(1))])
      .filter(([, el]) => el).map(([id, el]) => [id, el.getBoundingClientRect().top + window.scrollY]);
    const cur = currentSection(tops, window.scrollY + bar.offsetHeight + 24);
    for (const a of links) {
      const on = a.getAttribute('href') === `#${cur}`;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      // Not scrollIntoView: on a sticky bar that can jump the page to the bar's resting place.
      if (on && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: a.offsetLeft - (strip.clientWidth - a.offsetWidth) / 2 });
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

