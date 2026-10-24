# Sources for the money-flow (Sankey) amounts

General Fund side (FY2027): revenue links use Vol. I General Fund Revenues Table 2 (p.57); department links use the funnel bar4 values (Vol. I General Fund Expenditures Figure 2, p.89). Both total 2256.7.

Pension costs are inside each department's amount and are shown in the funnel instead, so there is no separate pension node.

Non-General-Fund side: every amount comes from a cached source; reproduce with `python3 -I docs/research/flows_nongf.py` (rewrites the amounts, refs, bond nodes and bond/TransNet rule texts in `data/curated/flows.json`; it hard-codes FY2026 operating and FY2025 CIP). The two sides are different fiscal years, as each link's `ref.doc` states.

## Groupings (FY2026 adopted operating budget, `operating_budget.csv` joined to `ref_funds.csv`; expense = Personnel + Non-Personnel)
- Water & sewer rates: Enterprise Funds whose fund name contains "Water" or "Sewer" (Water Utility Operating, Metropolitan Sewer Utility, Municipal Sewer Revenue) = $1,291.2M.
- Other utility & enterprise fees: the remaining Enterprise Funds (Development Services, Solid Waste Management, Refuse Disposal, Golf Course, Recycling, Airports) = $411.1M.
- Gas tax / TransNet: Special Revenue funds named Gas Tax or Road Maintenance (Gas Tax $39.3M, Road Maintenance and Rehabilitation $36.3M, FY2026 operating) plus TransNet Funds in the FY2025 adopted CIP ($25.2M, `cip_budget.csv`) = $100.9M. Mixed years, stated in the ref.
- Hotel tax set-asides: Special Revenue funds named Transient Occupancy Tax, Convention or PETCO (TOT $158.2M, PETCO Park $19.5M, Convention Center Expansion Administration $13.5M, New Convention Facility $2.9M) = $194.0M.
- Other restricted revenue: all other Special Revenue Funds = $730.9M.
- State & federal grants: no grant funds appear in the operating CSV and the FY2025 adopted CIP has no grant fund types. The only printed FY2027 grant total is $25.1M of homelessness grants (Vol. I Citywide Budget Overview p.44); other grants are not itemized, so the node understates total grants.
- Restricted and borrowed outflows (FY2025 adopted CIP, the latest adopted CIP in the CSV): bike & pedestrian = rows whose `project_name` matches bike|bicycle|cycle track|active transportation|pedestrian and not motorcycle ("Minor Bike Facilities", "University Ave Bikeway Pavement Repair"; $6.77M: Bond Financing $6.50M, TransNet Funds $0.27M, Development Impact Fees ~$0). Road repair = rows matching `is_road_repair` and not bike (essentially "Resurfacing of City Streets"; $98.09M: Bond Financing $79.50M, TransNet Funds $16.12M, Trench Cut/Excavation Fee Fund $2.47M). The same bucketing as the bike-lanes claim card.
- Bonds: a column-0 node "Bonds (borrowed for capital projects)" (kind `borrowed`) carries only the Bond Financing on those two groups ($86.00M) into a column-1 rule node "Borrowed money: capital projects the Council picks", which pays bike & pedestrian $6.50M (the highlighted flow) and road repair $79.497M. Bonds for other capital projects are not drawn.
- Under "Must go to what the grant or law says": bike & pedestrian gets its TransNet share ($0.273M), road repair its TransNet and trench-cut share ($18.588M), convention/arts the hotel inflow ($194.0M), and other programs the remainder ($838.1M), so the node balances (inflow $1,050.9M, outflow $1,050.961M after rounding).
- Why bonds are separate: in the CIP the bike money is almost all borrowed. Showing it under grant/law rules implied grant money; bond money can go to any capital project the Council picks, but not to day-to-day services.
- Source URLs: https://data.sandiego.gov/datasets/operating-budget/ and https://data.sandiego.gov/datasets/cip-fy-budget/

## Limitations
- The gas tax / TransNet inflow combines FY2026 operating expense (Gas Tax, Road Maintenance and Rehabilitation funds) with FY2025 adopted CIP TransNet. Expense is used as a proxy for revenue, and two fiscal years sit in one node. Road repair now uses the CIP road-repair rows, so the FY2026 gas-tax operating money ($75.7M) falls into the "other programs" remainder (its ref says so) rather than the road repair node.
- Grant-funded bike work (the state Active Transportation Program, SANDAG regional bikeways) largely does not appear in the city's adopted CIP CSV at the fund level, so the bike & pedestrian links ($6.50M bonds + $0.273M TransNet) understate it. The claim-checker card covers that with its own sources.
