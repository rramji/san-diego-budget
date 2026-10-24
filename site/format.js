// Pure formatting helpers. Money inputs are millions of dollars.
const trim = (n, d) => String(Number(n.toFixed(d)));

// Rounds before choosing the unit, so 999.96 is "$1B" and 0.9996 is "$1M", never "$1000M".
// One decimal under $100M ("$23.1M"), whole millions from $100M, two decimals in billions.
export function money(m) {
  const a = Math.abs(m);
  const k = Math.round(a * 1000);
  const sign = m < 0 && k > 0 ? '-' : '';
  if (k === 0) return '$0';
  if (k < 1000) return `${sign}$${k}K`;
  if (Number(a.toFixed(1)) < 100) return `${sign}$${trim(a, 1)}M`;
  if (Math.round(a) < 1000) return `${sign}$${Math.round(a)}M`;
  return `${sign}$${trim(a / 1000, 2)}B`;
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
