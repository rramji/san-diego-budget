# Sources for the money-flow (Sankey) amounts

General Fund side (FY2027): revenue links use Vol. I General Fund Revenues Table 2 (p.57); department links use the funnel bar4 values (Vol. I General Fund Expenditures Figure 2, p.89). Both total 2256.7.

Pension costs are inside each department's amount and are shown in the funnel instead, so there is no separate pension node.

Non-General-Fund side: every amount comes from a cached source; reproduce with `python3 -I docs/research/flows_nongf.py` (rewrites the amounts and refs in `data/curated/flows.json`). The two sides are different fiscal years, as each link's `ref.doc` states.

## Groupings (FY2026 adopted operating budget, `operating_budget.csv` joined to `ref_funds.csv`; expense = Personnel + Non-Personnel)
- Water & sewer rates: Enterprise Funds whose fund name contains "Water" or "Sewer" (Water Utility Operating, Metropolitan Sewer Utility, Municipal Sewer Revenue) = $1,291.2M.
- Other utility & enterprise fees: the remaining Enterprise Funds (Development Services, Solid Waste Management, Refuse Disposal, Golf Course, Recycling, Airports) = $411.1M.
- Gas tax / TransNet: Special Revenue funds named Gas Tax or Road Maintenance (Gas Tax $39.3M, Road Maintenance and Rehabilitation $36.3M, FY2026 operating) plus TransNet Funds in the FY2025 adopted CIP ($25.2M, `cip_budget.csv`) = $100.9M. Mixed years, stated in the ref.
- Hotel tax set-asides: Special Revenue funds named Transient Occupancy Tax, Convention or PETCO (TOT $158.2M, PETCO Park $19.5M, Convention Center Expansion Administration $13.5M, New Convention Facility $2.9M) = $194.0M.
- Other restricted revenue: all other Special Revenue Funds = $730.9M.
- State & federal grants: no grant funds appear in the operating CSV and the FY2025 adopted CIP has no grant fund types. The only printed FY2027 grant total is $25.1M of homelessness grants (Vol. I Citywide Budget Overview p.44); other grants are not itemized, so the node understates total grants.
- Restricted outflows: bike & pedestrian = FY2025 adopted CIP rows (latest adopted CIP in the CSV) whose `project_name` matches bike|bicycle|cycle track|active transportation|pedestrian and not motorcycle. Matches: "Minor Bike Facilities", "University Ave Bikeway Pavement Repair"; total $6.77M by fund type: Bond Financing $6.50M, TransNet Funds $0.27M, Development Impact Fees ~$0. Roads = gas tax/TransNet inflow; convention/arts = hotel inflow; other programs = remainder, so the node balances.
- Source URLs: https://data.sandiego.gov/datasets/operating-budget/ and https://data.sandiego.gov/datasets/cip-fy-budget/

## Limitations
- The gas tax / TransNet node (and the "roads" outflow that reuses its figure) combines FY2026 operating expense (Gas Tax, Road Maintenance and Rehabilitation funds) with FY2025 adopted CIP TransNet. Expense is used as a proxy for revenue, and two fiscal years sit in one node.
- Grant-funded bike work (the state Active Transportation Program, SANDAG regional bikeways) largely does not appear in the city's adopted CIP CSV at the fund level, so the bike & pedestrian link ($6.77M, mostly Bond Financing) understates it. The claim-checker card covers that with its own sources.
