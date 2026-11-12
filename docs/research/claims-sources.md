# Claim-checker, gap and glossary sources (Task 7)

Sources are the public URLs given in each figure's `source.url`. Page numbers are the printed page numbers (in `pdftotext -layout` output, the footer number that follows the page's text). A local cache of the PDFs is optional and not part of the repository.

## Bike-project matcher (`pipeline/bike_match.py`)

- `is_bike_project`: name contains `bike`, `bicycle`, `cycle track`, `active transportation` or `pedestrian` (case-insensitive), and not `motorcycle`. Not widened to `mobility`, `sidewalk`, `traffic calming`.
- `is_road_repair`: `street resurfacing`, `resurfacing`, `slurry seal`, `pavement`, `pothole`, `street repair`, or whole-word `road`, excluding `road improvements`.
  - Added `resurfacing`: the city's main repaving project is named "Resurfacing of City Streets", which "street resurfacing" misses.
  - Excluded `road improvements`: "Siempre Viva Road Improvements" and "Airway Road Improvements" (Otay Mesa, EIFD-funded, $0.5M each) are road construction, not repair.
  - Whole-word `road`: avoids "Broadway", "Railroad".
- A project matching both counts once, as bike ("University Ave Bikeway Pavement Repair").
- `docs/research/flows_nongf.py` now imports `is_bike_project`, so the Sankey and the card count the same projects.

### FY2025 adopted CIP (cip_budget.csv; latest FY with adopted rows, FY2026 is absent)

Bike & pedestrian, $6.77M total:
- Minor Bike Facilities: TransNet Funds $0.27M, Development Impact Fees $51
- University Ave Bikeway Pavement Repair: Bond Financing $6.50M

Road repair, $98.08M total:
- Resurfacing of City Streets: Bond Financing $79.50M, TransNet Funds $16.12M, Trench Cut/Excavation Fee Fund $2.47M

Chart omits fund types under $10k across both groups (DIF $51). `data/curated/flows.json` splits the same $6.77M: `rule_capital -> bike_ped` $6.50M (Bond Financing) and `rule_restricted -> bike_ped` $0.273M (TransNet).

The city CIP CSV leaves out SANDAG-built regional bikeways and most grant-funded projects:
- SANDAG Bikeways and Complete Streets (Bike Early Action Program; 2% of TransNet to bike/ped/neighborhood safety): https://www.sandag.org/projects-and-programs/bikeways-and-complete-streets . The URL `https://sandag.org/projects-and-programs/bikeways-and-walkways/regional-bikeways-and-walkways` returned a 404 page on 2026-10-24, so it is not cited.
- Times of San Diego 2024-06-27, ~$25M Imperial Avenue Bikeway, TransNet + state ATP grant: https://timesofsandiego.com/life/2024/06/27/work-on-25-million-imperial-avenue-bikeway-officially-begins-with-groundbreaking/
- City press release 2026-02-10, $6.9M SANDAG TransNet Smart Growth Incentive Program, incl. $3.5M Chollas Creek to Bayshore Bikeway: https://www.sandiego.gov/sites/default/files/2026-02/2026-2-10-city-of-san-diego-receives-nearly-7-million-in-sandag-funding.pdf
- FY2027 GF multimodal team cut $2.6M (IBA 26-11 p.35); IBA 26-11 p.306: "will eliminate new bikeway installations".

## Pensions
IBA 26-11 p.75: ADC $563.2M (+$30.0M from $533.2M), GF $396.1M; 8.8% citywide, 17.7% GF; UAL $3.46B and 76.1% funded at 2025-06-30 (74.7% a year earlier). IBA 26-11 p.3: pension increase and slower revenue growth raised baseline deficit to $118.0M. IBA 25-36 p.7: full ADC funded since FY2006.

Expanded 2026-11-11 after Reddit comments ("pensions are the real reason", "give employees 401(k)s", "reform already neutered pensions, 15 years to age out"). VAL25 = SDCERS City of San Diego Actuarial Valuation as of June 30, 2025 (Cheiron); ACFR25 = SDCERS Annual Comprehensive Financial Report 2025. Printed page numbers. Longer notes in `pension-reserves-2026-10.md`.

- VAL25 Table V-1 p.35 (total City column, paid at start of year): UAL payment $375.3M; normal cost $170.4M; administrative expenses $16.1M; Prop B police tier conversion $1.9M; ADC $563.2M. Rates: total normal cost 28.04% of pay, member 14.03%, employer 14.01%. Non-safety columns: General Old Plan payroll $185.5M, 2009 Plan $699.6M, weighted non-safety $887.5M; normal cost 25.73% vs 23.78%; UAL $1,631.6M vs $240.6M.
- VAL25 Table V-1 (safety) p.36: member contribution rate 18.56%, employer normal cost rate 18.25% (weighted safety).
- VAL25 Appendix A p.76: employee rate includes the Charter Section 143 "substantially equal" rate, 50% of the normal cost of service retirement allowances.
- VAL25 Appendix A p.71: non-safety employees withdrew from Social Security effective January 1, 1982; safety employees never participated.
- ACFR25 MD&A Table 4 p.25 (City column, FY2025, $ thousands): plan sponsor contributions 487,515; member and other contributions 159,281; net investment income 965,717; benefit payments 659,587.
- VAL25 Table I-1 p.3: UAL $3,464.3M; funded ratio 76.1% (74.7% prior).
- VAL25 p.7: 2001–2004 funded ratio 97.3% → 65.8%, "dot com" decline "coupled with the City underfunding the Plan while benefits were increased"; 2007–2009 78.8% → 66.5%.
- VAL25 p.16: UAL change since 2009: assumptions +$1,821.7M; investment + liability experience +$1,493.6M; all other −$1,154.2M "largely due to contributions in excess of the ADC"; net +$2,161.1M. Discount rate lowered from 8.00% to 6.50% (p.7).
- VAL25 p.1: Prop B unwound; plan reopened to non-police employees July 10, 2021. FY25 CBO p.67: "In early 2021, the California Superior Court invalidated Proposition B."
- VAL25 Table V-2 p.37: "Proposition B Shortfall" base 7/1/2022, $119,051,737, 20 years.
- VAL25 p.12: baseline projection ADC FY2028 $573.2M, FY2029 $493.4M; 100% funded "by the June 30, 2041 valuation at which time the ADC declines sharply".
- Not stated in any document, so not on the card: what a 401(k)-style plan would cost the city; "79%" (699.6 / 887.5) is left as the two figures.
- 2026-11-12: the card became one intro paragraph plus four pictures (`claims.json` `visual`, drawn by `site/charts/pension-card.js`; schema in `docs/data-contracts.md`): the stacked payment, who pays (rates and FY2025 flows), the funded-ratio history with what moved the shortfall since 2009, and the two plan tiers with the Proposition B timeline. The payment's pieces (375.3 + 170.4 + 16.1 + 1.9 = 563.7) print $0.5M over the $563.2M total because administrative expenses are the throughout-the-year amount while the total is paid at the start of the year (Table V-1 note "numbers may not add due to rounding"); the bar's widths use the pieces' sum.

## Managers
No series of manager counts over time exists in the cached data or the CSVs. IBA 26-11 p.46: 833.00 of 12,628.50 standard-hour FTEs (6.6%) unclassified/unrepresented; p.47 GF table (City Council 135.00 unclassified); p.48: unclassified = 37.0% of net FTE reduction; p.7 footnote 8: unclassified as "general shorthand" for management. Axios 2024-12-12 returned HTTP 403 to WebFetch (implementer and reviewer). Only the headline is cited (seen by the controller in search results): "Amid $200 million annual deficit, San Diego managers have grown 461% in 10 years"; the article's definition of managers is unverified.

## Trash fee
IBA 26-11 p.3 fn.4 (fee funds only collection; relieved GF of most collection costs); IBA 25-11 p.32 ($73.8M transfer of trash collection to Solid Waste Fund); IBA 26-11 p.168 (Measure B 2022 eligibility rules), p.175 (FY2026 first year residents paid directly); IBA 26-15 p.44 (May 20 tentative settlement), p.45 ($40.9M FY2028 rate revenue drop; ~$10.8M FY2028 / $10.0M FY2029 GF impact; cost risks). "$150M": not in any cached IBA text. 10News (verified via WebFetch 2026-10-24) quotes the Mayor's office: "Repeal of the trash fee would blow an estimated $150 million hole in the City's budget." Cited to the Mayor's office, not the IBA. https://www.10news.com/news/local-news/san-diego-news/attorney-san-diego-city-council-rejects-proposed-trash-fee-lawsuit-settlement

## Homelessness
Line from `series.gf_dept_by_fy`, dept "Homelessness Strategies & Solutions": FY2021 $49.1M (3.0%), FY2022 $18.1M (1.0%), FY2023 $25.2M, FY2024 $44.0M, FY2025 $53.9M, FY2026 $53.2M (2.5%). No earlier years (not zero-filled). FY2027 adopted $62.0M (Vol. I GF Expenditures p.89); $4.9M homelessness reductions in the Proposed Budget (IBA 26-11 p.34); the May Revision reinstated the $3.75M unspecified target and replaced it with specific cuts incl. $2.9M at 16th & Newton (IBA 26-15 Att. 1 pp.8, 22); FY2021 to FY2022 drop is removal of one-time COVID-19 relief run through the GF, no programmatic reductions (IBA 21-10 p.120); $72.9M citywide homelessness services (IBA 26-11 p.67); TOT/Measure C funding (p.195).

## Gap and population
pre-cut $118.0M (IBA 26-11 p.3); post-cut $23.1M and skipped reserve $80.1M (Exec Summary p.5); 103.2 = 23.1 + 80.1; FY2028 ~$30M (KPBS 2026-06-09, IBA's Charles Modica); sales tax $386.7M (Vol. I GF Revenues Table 2, p.57). Population 1,419,531 and households 549,999 (CA DOF E-5, Jan 1 2026, provisional). `cuttable_m` is injected at build time from `funnel.bar3.everything_else_m` (whole Figure).
