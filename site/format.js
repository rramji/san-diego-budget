// Pure formatting helpers. Money inputs are millions of dollars.
const trim = (n, d) => String(Number(n.toFixed(d)));

export function money(m) {
  const sign = m < 0 ? '-' : '';
  const a = Math.abs(m);
  if (a >= 1000) return `${sign}$${trim(a / 1000, 2)}B`;
  if (a >= 1) return `${sign}$${a < 10 ? trim(a, 1) : Math.round(a)}M`;
  return `${sign}$${Math.round(a * 1000)}K`;
}

export function pct(x, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

export function perPerson(m, population) {
  return `$${Math.round((m * 1e6) / population).toLocaleString('en-US')} per person per year`;
}

// A 1% sales tax raises onePctM, so m raises (m / onePctM) of one percentage point = cents per dollar.
export function cents(m, onePctM) {
  return `about ${(m / onePctM).toFixed(1)}¢ on each dollar`;
}

export default { money, pct, perPerson, cents };
