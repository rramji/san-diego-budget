// Pure arithmetic for the chapter 3 calculator. Inputs are gap.json Figures {value, source}.
const MODES = {
  pre_cut: [{ id: 'pre_cut', label: 'The gap before cuts', framing: 'Both', key: 'pre_cut_m' }],
  post_cut: [
    { id: 'post_cut_city', label: "The city's number", framing: 'City budget office', key: 'post_cut_city_m' },
    { id: 'post_cut_iba', label: "The Independent Budget Analyst's number", framing: 'Independent Budget Analyst', key: 'post_cut_iba_m' },
  ],
};

export function compute(gap, mode) {
  const defs = MODES[mode];
  if (!defs) throw new Error(`unknown mode: ${mode}`);
  const pop = gap.population.value;
  const hh = gap.households.value;
  const tax = gap.sales_tax_1pct_m.value;
  const cut = gap.cuttable_m.value;
  const figures = defs.map(({ id, label, framing, key }) => {
    const amount_m = gap[key].value;
    const perHousehold = (amount_m * 1e6) / hh;
    const shareOfCuttable = amount_m / cut;
    return {
      id, label, framing, amount_m,
      perPerson: (amount_m * 1e6) / pop,
      perHousehold,
      centsPerDollar: amount_m / tax,
      monthlyFeePerHousehold: perHousehold / 12,
      shareOfCuttable,
      oneDollarIn: Math.round(1 / shareOfCuttable),
      sources: {
        amount: gap[key].source, population: gap.population.source, households: gap.households.source,
        sales_tax: gap.sales_tax_1pct_m.source, cuttable: gap.cuttable_m.source,
      },
    };
  });
  return { figures };
}

export default { compute };
