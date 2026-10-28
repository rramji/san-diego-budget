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

// A money amount exactly as curated copy writes it: "$9.5M", "$12M" for 12.0 (the shortest round-trip number, as
// in JavaScript's String(), with no trailing ".0"). pipeline/build.py money_token() writes the same text.
export function moneyToken(m) {
  return `$${String(Number(m))}M`;
}

export function pct(x, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

export function perPerson(m, population) {
  return `$${Math.round((m * 1e6) / population).toLocaleString('en-US')} per person per year`;
}

// A 1% sales tax raises onePctM, so m raises (m / onePctM) of one percentage point = cents per dollar.
// Under 0.1¢ one decimal would round a real amount to "0.1¢" or "0.0¢", so two decimals are shown.
export function cents(m, onePctM) {
  const c = m / onePctM;
  return `about ${c.toFixed(c < 0.1 ? 2 : 1)}¢ on each dollar`;
}

// A monthly dollar amount: cents under $10 ("$3.50 a month"), whole dollars from $10.
export function monthly(dollars) {
  return Math.round(dollars * 100) < 1000 ? `$${dollars.toFixed(2)} a month` : `$${Math.round(dollars)} a month`;
}

export default { money, moneyToken, pct, perPerson, cents, monthly };
