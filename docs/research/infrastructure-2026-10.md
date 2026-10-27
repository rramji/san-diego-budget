# San Diego infrastructure funding: research notes for the explainer

Researched 2026-10-26. Every figure below was read directly from the cited PDF. Page numbers are the PRINTED page numbers (footer), not PDF index, unless marked "PDF p.". Where I added numbers myself, the row is marked **(my arithmetic)**. The text was extracted with `pdftotext -layout`. Charts in the PDFs were not read as images, so a chart's numbers are cited only where its text labels came through intact.

## Source documents (URL -> local cache)

Cache root: `/tmp/claude-1000/-home-robert-research-sandiego/b664ae6d-58ba-4852-9ecf-efa1c0dcae79/scratchpad/dl-infra/`

| Short name | Title | URL | Local PDF (+ .txt alongside) |
|---|---|---|---|
| IBA 25-36 | IBA Report 25-36, Review of the Mayor's FY 2027-2031 Five-Year Financial Outlook (Dec 2025) | https://www.sandiego.gov/sites/default/files/2025-12/25-36-review-of-the-mayor-s-fy-2027-2031-five-year-financial-outlook_2.pdf | dl-infra/iba2536/iba2536.pdf |
| CIPO 26-30 | FY 2026-2030 Five-Year Capital Infrastructure Planning Outlook (Feb 2025) | https://sandiego.gov/sites/default/files/2025-02/fy-26-30-five-year-capital-infrastructure-planning-outlook.pdf | dl-infra/cipo2630/cipo2630.pdf |
| IBA 25-08 | IBA Report 25-08, IBA Review of the FY 2026-2030 Five-Year Capital Infrastructure Planning Outlook (Feb 2025) | https://www.sandiego.gov/sites/default/files/2025-02/25-08-iba-review-of-the-mayor-s-fy-2026-2030-cip-five-year-financial-outlook_final-complete-rpt.pdf | dl-infra/iba2508/iba2508.pdf |
| CIPO 27-31 | FY 2027-2031 Five-Year Capital Infrastructure Planning Outlook (Feb 2026) | https://www.sandiego.gov/sites/default/files/2026-02/fy-27-31-five-year-capital-infrastructure-planning-outlook.pdf | dl-infra/cipo2731/cipo2731.pdf |
| IBA 26-06 | IBA Report 26-06, IBA Review of the FY 2027-2031 Five-Year Capital Infrastructure Planning Outlook (Mar 5, 2026) | https://www.sandiego.gov/sites/default/files/2026-03/26-06-iba-review-of-the-mayor-s-fy-2027-2031-five-year-capital-infrastructure-planning-outlook.pdf | dl-infra/iba2606/iba2606.pdf |
| FY27 Vol I CIP | FY 2027 Adopted Budget, Volume 1, Capital Improvements Program chapter | https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1cip.pdf | dl-infra/fy27v1cip/fy27v1cip.pdf |
| FY27 Vol III | FY 2027 Adopted Budget, Volume III, Capital Improvements Program (full, 437 pp.) | https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3.pdf | dl-infra/v3full/v3full.pdf |
| FY27 Vol III summary | The "Fiscal Year 2027 Adopted Budget Summary" section of Volume III, also posted on its own (printed pp. 4-23, same page numbers as the full volume) | https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3summary.pdf | dl-infra/v3summary/v3summary.pdf |
| (also downloaded) | Vol III intro and project guide sections | https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3intro.pdf ; https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3projectguide.pdf | dl-infra/v3intro/, dl-infra/v3projectguide/ |
| PMP FY24 | Pavement Management Plan (Jan 2024; two printed pages per PDF page) | https://www.sandiego.gov/sites/default/files/2024-01/pavement-management-plan-report.pdf | dl-infra/pmp2024/pmp2024.pdf |
| PMP FY25 | Pavement Management Plan FY25 Update (Apr 2025) | https://www.sandiego.gov/sites/default/files/2025-04/2025.04.30-final-pmp-update.pdf | dl-infra/pmp2025/pmp2025.pdf |
| PMP FY26 | Pavement Management Plan FY26 Update (Apr 2026) | https://www.sandiego.gov/sites/default/files/2026-04/fy2026-pmp-update.pdf | dl-infra/pmp2026/pmp2026.pdf |

I did not use the city open-data CIP CSVs. Volume III gave the adopted figures directly.

---

## Q1. Where does "$6.51B unfunded infrastructure" come from, and what does "unfunded" mean?

**Plain-English answer.** The $6.51 billion comes from the city's **FY 2026-2030 Five-Year Capital Infrastructure Planning Outlook** (the "CIP Outlook"), published February 2025. Each year, city departments list every capital project they say they need over the next five years. The Department of Finance then forecasts how much money will be available to pay for those projects. "Unfunded", or the "funding gap", is simply **five-year needs minus five-year projected funding**. In that Outlook, needs were $11.87B, funding was $5.36B, and the gap was $6.51B (exact table figure: $6,506,462,930). The IBA's December 2025 report (25-36) calls this "the City's most recent" CIP Outlook. It had not yet been replaced when 25-36 came out.

**The figure is out of date.** In February 2026 the city published the **FY 2027-2031 CIP Outlook**: needs **$12.82B**, funding **$5.01B**, gap **$7.82B** (the summary rounds it to "$7.8 billion"). The IBA's March 2026 review (26-06) says the gap grew $1.3B (20%), and that stormwater drove almost all of the growth. Any 2026-27 explainer should use **$7.8B (FY 2027-2031)**, or say clearly that $6.51B was the previous year's figure.

**Three points readers need:**
1. The "need" total includes water, sewer, Pure Water, airports, golf and landfills. These are "enterprise" assets, paid for by customer rates and fees, and the Outlook treats them as **100% funded**. The **whole gap falls on "General Fund" assets**, meaning things paid for by general city money: stormwater, streets, sidewalks, streetlights, parks, fire, police and lifeguard stations, and city buildings. IBA 25-08 says General Fund assets "account for all of the $6.51 billion funding gap". IBA 26-06 says "the entire funding gap is attributed to General Fund assets".
2. It is a **planning estimate, not a budget**. Both Outlooks say: "It is not a budget document."
3. It is **only five years**. Additional needs beyond the window were $8.90B (FY2031+, in the FY26-30 Outlook) and $5.96B (FY2032+, in the FY27-31 Outlook). These are not counted in the gap. The Outlook also leaves out some things entirely: sea walls (except Ocean Beach Pier), Convention Center expansion beyond already-approved money, IT projects, routine maintenance and repair, and fleet vehicles.

| Figure | Value | Doc | Printed page | URL |
|---|---|---|---|---|
| "$6.51 billion funding gap for infrastructure projects for which resources have not been identified" | $6.51B | IBA 25-36 | 7 | https://www.sandiego.gov/sites/default/files/2025-12/25-36-review-of-the-mayor-s-fy-2027-2031-five-year-financial-outlook_2.pdf |
| "$6.51 billion General Fund capital infrastructure gap, a 281% increase since FY 2016" | $6.51B; +281% | IBA 25-36 | 30 | same |
| "$6.5 billion deferred capital backlog" (in the GO-bond discussion) | $6.5B | IBA 25-36 | 35 | same |
| Facilities repair backlog "may now exceed $1 billion" | >$1B | IBA 25-36 | 29 | same |
| FY26-30 five-year capital needs | $11.87B ($11,871,461,885) | CIPO 26-30 | ES-1; Table 22 p.37 | https://sandiego.gov/sites/default/files/2025-02/fy-26-30-five-year-capital-infrastructure-planning-outlook.pdf |
| FY26-30 projected funding | $5.36B ($5,364,998,955) | CIPO 26-30 | ES-1; Table 22 p.37 | same |
| FY26-30 funding gap | $6.51B ($6,506,462,930) | CIPO 26-30 | ES-1; Table 22 p.37 | same |
| FY26-30 needs beyond window (FY2031+) | $8.90B ($8,900,210,719) | CIPO 26-30 | ES-1; Table 23b p.39 | same |
| General Fund assets "account for all of the $6.51 billion funding gap" | — | IBA 25-08 | 6 | https://www.sandiego.gov/sites/default/files/2025-02/25-08-iba-review-of-the-mayor-s-fy-2026-2030-cip-five-year-financial-outlook_final-complete-rpt.pdf |
| FY26-30 water and wastewater share of projected funding | $3.8B (70.7%) | IBA 25-08 | 5 | same |
| **FY27-31 five-year capital needs (current)** | **$12.82B ($12,824,957,449)** | CIPO 27-31 | ES-1; Table 23 p.35 | https://www.sandiego.gov/sites/default/files/2026-02/fy-27-31-five-year-capital-infrastructure-planning-outlook.pdf |
| **FY27-31 projected funding** | **$5.01B ($5,009,860,627)**; ES-1 rounds to "$5 billion" | CIPO 27-31 | ES-1; Table 23 p.35 | same |
| **FY27-31 funding gap** | **$7.82B ($7,815,096,823)**; ES-1 says "$7.8 billion", p.35 says "$7.81 billion" | CIPO 27-31 | ES-1; Table 23 p.35 | same |
| FY27-31 needs beyond window (FY2032+) | $5.96B ($5,955,972,975) | CIPO 27-31 | ES-1; Table 24b p.37 | same |
| Gap change vs. prior year | +$1.3B, +20% | IBA 26-06 | 3 | https://www.sandiego.gov/sites/default/files/2026-03/26-06-iba-review-of-the-mayor-s-fy-2027-2031-five-year-capital-infrastructure-planning-outlook.pdf |
| Needs change vs. prior year | +$953.5M, +8% | IBA 26-06 | 8 (also 2) | same |
| Funding change vs. prior year | −$355.1M, −7% | IBA 26-06 | 4 | same |
| Water and wastewater enterprise funds as a share of FY27-31 projected funding | $3,329.5M (66%) | IBA 26-06 | 5 | same |
| Flexible "General Fund financing" (lease revenue bonds) in the FY27-31 Outlook | $531.0M (11%), of which $474.3M for new General Fund CIP and $57.0M for the WIFIA match | IBA 26-06 | 5 | same |
| Share of LRB proceeds by use | Stormwater $260.1M (49%), Transportation $187.5M (35%), Fire-Rescue $52.6M (10%), Facilities $23.3M (4%), Homelessness $7.5M (2%) | IBA 26-06 | 6 | same |
| Of the stormwater LRB money, set aside for emergencies | $150.0M over 5 years | IBA 26-06 | 7 | same |
| Infrastructure Fund (Charter 77.1) deposits assumed in the FY27-31 Outlook | none (−$87.9M vs. prior year) | IBA 26-06 | 4 | same |

**Confusing or contradictory points (Q1)**
- **$6.51B is superseded.** IBA 25-36 (Dec 2025) correctly called the FY26-30 Outlook "most recent". By February 2026 the FY27-31 Outlook had replaced it with $7.8B. The FY 2027 Adopted Budget (Vol I p.169) names the FY27-31 Outlook as its guide.
- **"General Fund gap" vs. "total need".** IBA 25-36 p.30 calls $6.51B a "General Fund capital infrastructure gap". That is accurate for the *gap*. But the $11.87B *need* behind it includes about $3.8B of water and sewer work that the Outlook treats as fully funded. Do not describe $11.87B as "General Fund needs".
- **"Deferred capital backlog"** (IBA 25-36 p.35) is looser wording. The $6.5B is a projected five-year shortfall, not an inventory of repairs already overdue.
- **Rounding varies within CIPO 27-31.** The gap is "$7.8 billion" (ES-1), "$7.81 billion" (p.35) and $7,815,096,823 (Table 23). Funding is "$5 billion" in the text and $5,009,860,627 in Table 23.
- **A different "unfunded" number exists.** Volume III of the FY27 budget lists **$8.21B of "Unidentified Funding"** ($8,212,169,678; Vol III pp.62 and 64). That figure covers only projects already in the CIP and spans their whole life, not five years. It is a separate measure from the Outlook gap; do not mix the two.

---

## Q2. Breakdown of the unfunded need by asset type

**Plain-English answer.** **Stormwater dominates.** It covers storm drains, flood channels, pump stations and "green infrastructure" built to meet clean-water rules. In the current FY27-31 Outlook, stormwater is $5.09B of the $7.82B gap (65%). Next come **street repaving** ($678M, 9%), **streetlights** ($467M, 6%), **new and expanded fire stations** ($310M, 4%), **sidewalks** ($253M), **police stations** ($222M) and **parks** ($221M). Water, wastewater, Pure Water, airports, golf and landfills show **$0 gap**. In the older FY26-30 Outlook (the $6.51B), stormwater was $3.74B, about 57% **(my arithmetic)**. Streetlights ($487M), sidewalks ($319M), pavement ($305M) and fire stations ($278M) followed.

Some asset types are almost entirely unfunded. In the FY27-31 Outlook, the gap equals the full need for police stations ($222.1M need, $222.1M gap). Streetlights are funded only about 3% (need $482.5M, gap $467.2M) and stormwater about 8% (need $5.51B, funded $425.2M). These percentages are my arithmetic from the table values.

### FY 2027-2031 Outlook (current), five-year gap by asset

Source: IBA 26-06 p.4 summary table (in $M, with share of gap); exact figures from CIPO 27-31 asset tables on the pages listed.

| Asset type | 5-yr need | 5-yr gap | Share of gap (IBA) | CIPO 27-31 table page |
|---|---|---|---|---|
| Stormwater | $5,510,531,351 | $5,085,301,332 | 65% | p.61 (Table 43) |
| Streets and roads, pavement | $969,609,702 | $677,927,438 | 9% | p.45 (Table 30) |
| Streetlights | $482,510,176 | $467,150,699 | 6% | p.46 (Table 31) |
| New/expanded fire stations | $376,659,128 | $309,904,129 | 4% | p.56 (Table 40) |
| Sidewalks | $299,733,733 | $252,530,733 | 3% | p.42 (Table 28) |
| New/expanded police stations | $222,140,007 | $222,140,007 | 3% | p.55 (Table 39) |
| Parks | $507,065,722 | $221,288,311 | 3% | p.53 (Table 37) |
| Existing facilities (city buildings) | $182,580,682 | $157,162,842 | 2% | p.48 (Table 33) |
| Traffic signals and ITS | $175,666,480 | $121,050,430 | 2% | p.47 (Table 32) |
| Streets and roads, modifications | $286,548,845 | $113,375,826 | 1% | p.44 (Table 29) |
| Bike facilities | $103,945,479 | $88,629,978 | 1% | p.40 (Table 26) |
| Bridges | $76,696,441 | $52,505,126 | 1% | p.41 (Table 27) |
| New lifeguard stations | $82,205,770 | $38,529,971 | 0% | p.57 (Table 41) |
| Housing and shelters | $12,500,000 | $5,000,000 | 0% | p.58 (Table 42) |
| New fleet facilities | $2,600,000 | $2,600,000 | 0% | p.49 (Table 34) |
| New libraries | $23,500,000 | $0 | 0% | p.51 (Table 36) |
| Water | $1,659,692,892 | $0 | — | p.63 (Table 44) |
| Wastewater | $1,367,241,653 | $0 | — | p.64 (Table 45) |
| Pure Water (potable reuse) | $302,528,405 | $0 | — | p.65 (Table 46) |
| Airports | $53,785,583 | $0 | — | p.39 (Table 25) |
| Golf | $99,810,000 | $0 | — | p.53 (Table 38) |
| Landfills | $27,405,400 | $0 | — | p.49 (Table 35) |
| **Total** | **$12,824,957,449** | **$7,815,096,823** | 100% | p.35 (Table 23); needs by asset in Table 24a pp.35-36 |

URLs: CIPO 27-31 https://www.sandiego.gov/sites/default/files/2026-02/fy-27-31-five-year-capital-infrastructure-planning-outlook.pdf ; IBA 26-06 https://www.sandiego.gov/sites/default/files/2026-03/26-06-iba-review-of-the-mayor-s-fy-2027-2031-five-year-capital-infrastructure-planning-outlook.pdf

(The asset gaps above add up to the Table 23 total within $1 of rounding **(my arithmetic)**.)

### FY 2026-2030 Outlook (source of the $6.51B), five-year gap by asset

Source: CIPO 26-30, https://sandiego.gov/sites/default/files/2025-02/fy-26-30-five-year-capital-infrastructure-planning-outlook.pdf

| Asset type | 5-yr need | 5-yr gap | Printed page |
|---|---|---|---|
| Stormwater | $4,131,678,220 | $3,737,305,944 | 63 (Table 42) |
| Streetlights | $489,092,371 | $486,941,780 | 48 (Table 30) |
| Sidewalks | $326,468,277 | $318,965,512 | 44 (Table 27) |
| Streets and roads, pavement | $837,483,728 | $305,381,784 | 47 (Table 29) |
| New fire stations | $316,030,924 | $278,130,924 | 59 (Table 39) |
| Parks | $442,173,914 | $244,229,765 | 55 (Table 36) |
| Bridges | $205,826,378 | $196,709,968 | 42 (Table 26) |
| Existing facilities | $191,017,383 | $191,017,383 | 50 (Table 32) |
| New police stations | $177,373,599 | $177,373,599 | 57 (Table 38) |
| Streets and roads, modifications | $333,513,579 | $150,606,303 | 46 (Table 28) |
| Bike facilities | $135,528,443 | $131,757,264 | 41 (Table 25) |
| Traffic signals and ITS | $184,863,329 | $130,150,233 | 49 (Table 31) |
| New lifeguard stations | $64,600,000 | $60,600,000 | 59 (Table 40) |
| Housing and shelters | $43,094,580 | $42,244,580 | 61 (Table 41) |
| New libraries | $41,647,892 | $37,947,892 | 53 (Table 35) |
| New fleet facilities | $17,100,000 | $17,100,000 | 51 (Table 33) |
| Water / Wastewater / Pure Water / Airports / Golf / Landfills | $2.02B / $1.47B / $299.0M / $63.7M / $54.9M / $24.6M | $0 each | 64, 64, 67, 40, 56, 52 |
| **Total** | **$11,871,461,885** | **$6,506,462,930** | 37-38 (Tables 22, 23a) |

IBA 25-08 groups the gap by department: Stormwater $3.74B, Transportation $1.72B, Fire-Rescue $338.7M (IBA 25-08 p.7). Its transportation table (Attachment 1, printed p.10, PDF p.22) gives the share of each need that is funded: pavement 63.5%, modifications 54.8%, signals 29.6%, bridges 4.4%, bike 2.8%, sidewalks 2.3%, streetlights 0.4%.

**Stormwater detail (FY27-31, IBA 26-06 p.10):** flood resilience need $3,382.3M, funded $383.9M, gap $2,998.4M. New emergencies $150.0M, fully funded. Green infrastructure (water quality) need $2,128.2M, funded $41.4M, gap $2,086.9M. Total need $5,510.5M, funded $425.2M, gap $5,085.3M. Stormwater is 43% of all needs, more than water and wastewater combined (IBA 26-06 p.9).

**Confusing or contradictory points (Q2)**
- **Asset categories changed between years.** In FY27-31 the Police Department Traffic Division project ($35.0M) moved from "existing" to "expanded" facilities (IBA 26-06 p.12). IBA 26-06 p.12 also says a series of library roof and HVAC projects "were inadvertently left out" of this year's report.
- **Pavement need is lower than it looks because the target was lowered.** The FY27-31 Outlook prices keeping streets at an average condition score (PCI) of 65 ("fair"), down from 70 ("good") the year before. Even so, the five-year pavement capital need rose from $837.5M to $969.6M (IBA 26-06 p.11). Including operations and maintenance, total pavement need fell by $647.5M (CIPO 27-31 p.43).
- **Parks figures disagree inside CIPO 27-31.** FY2031 parks need is $86,106,574 in Table 24a (p.36) but $85,106,574 in Table 37 (p.53). Both tables give the same five-year total, $507,065,722.
- **Wrong column headers.** CIPO 27-31 Table 45 (Wastewater, p.64) labels its columns "FY 2026 ... FY 2030", although the report covers FY 2027-2031.
- **Missing value.** The FY26-30 "Existing Facilities" gap row (p.50) prints "26,833,094" without a $ sign. The extraction was clean; only the formatting differs.

---

## Q3. Named examples of unfunded or underfunded needs, and road condition

**Plain-English answer.** The documents name many specific gaps. Stormwater pump stations, several creek and drainage channel projects, a new Fire-Rescue training center and the Fairmount Avenue fire station are unfunded. The Ocean Beach Pier replacement is 95% unfunded. Volume III of the FY27 budget lists each project's "unidentified funding". IBA 26-06 describes the largest items.

On roads, San Diego has about 6,600 lane miles of streets and alleys. The 2023 condition survey scored the network at an average PCI (Pavement Condition Index, 0-100) of **63, "fair"**, down from 71 in 2016. **About 34% of streets scored 54 ("poor") or lower.** After two years of heavier paving, the city estimates it **entered FY26 at about 65**. It has **lowered its goal from PCI 70 to PCI 65** because it lacks the money. If only currently known funding arrives, the network is projected to fall to **52 ("poor") by FY36**. FY26 paving funding was **$83M, about 32%** of what the original PCI-70 plan called for.

### Named examples

| Project / need | Figure | Doc | Printed page | URL |
|---|---|---|---|---|
| Stormwater pump station rehabilitation projects | $259.8M, "all of which is unfunded" | IBA 26-06 | 10 | https://www.sandiego.gov/sites/default/files/2026-03/26-06-iba-review-of-the-mayor-s-fy-2027-2031-five-year-capital-infrastructure-planning-outlook.pdf |
| Jamacha Drainage Channel Upgrade | $112.6M need, $12.7M funded | IBA 26-06 | 10 | same |
| Switzer Creek drainage system (replace and upsize storm drains and outfall to the bay) | $99.6M, all unfunded | IBA 26-06 | 10 | same |
| Upper Auburn Creek Revitalization | $82.8M, all unfunded (IBA). Vol III: $84,920,840 unidentified (96.76% unfunded), priority score 88 "High" | IBA 26-06; FY27 Vol III | 10; 64 | same; https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3.pdf |
| Los Peñasquitos Lagoon Restoration Phase 1 | $112.1M, all unfunded | IBA 26-06 | 10 | IBA 26-06 URL |
| Pump Station G & 17 Full Improvement | $65,839,690 unidentified (88.59%), priority score 95 "High" | FY27 Vol III | 64 (score p.45) | Vol III URL |
| New Fire-Rescue training center (current one at NTC will be repurposed for Pure Water in FY 2029) | $249.6M ("updated costs may be closer to $373 million"), no funding identified | IBA 26-06 | 13 | IBA 26-06 URL |
| Fairmount Avenue Fire Station | "lacks funding" (IBA). Vol III: $24,272,205 unidentified (86.69%) | IBA 26-06; Vol III | 14; 64 | both |
| Fire Station 54, Paradise Hills | $29,916,347 unidentified (99.72%), status "Underfunded" | Vol III | 64 (status p.44) | Vol III URL |
| New Police Academy and SWAT building at Police Plaza, plus a new Firearm Training Facility | New police station needs $105.7M, "no funding is anticipated" | IBA 26-06 | 14 | IBA 26-06 URL |
| Ocean Beach Pier Replacement | $180,713,000 unidentified (95.13%) | Vol III | 64 | Vol III URL |
| Convention Center Phase III Expansion | $681,640,478 unidentified (99.51%), status "Underfunded" | Vol III | 64 (status p.44) | Vol III URL |
| Fire-Rescue Air Ops Facility Phase II | $37,989,629 unidentified (88.85%) | Vol III | 64 | Vol III URL |
| North Pacific Beach Lifeguard Station | $12,205,178 unidentified (92.82%) | Vol III | 64 | Vol III URL |
| NTC Aquatic Center | $59,451,563 unidentified (99.09%) | Vol III | 64 | Vol III URL |
| Fire-Rescue facility upgrades to move off natural gas (Council Policy 900-03) | $44.0M unfunded, plus $39.6M after FY 2032 | IBA 26-06 | 12 | IBA 26-06 URL |
| Police Range Refurbishment Phase II, Remediation | $20.0M unfunded | IBA 26-06 | 12 | IBA 26-06 URL |
| Unimproved (dirt or substandard) streets | $4.3M FY 2027 need, $23.3M over 5 years, none funded | IBA 26-06 | 12 | IBA 26-06 URL |
| High-risk corrugated metal storm pipe | WIFIA loan addresses 6 miles; 20 miles remain unaddressed | IBA 26-06 | 11 | IBA 26-06 URL |
| Emergency stormwater CIP spending | $8.9M (FY 2021) to $93.6M (FY 2025); almost $200M over those 5 years | IBA 26-06 | 11 | IBA 26-06 URL |
| Streetlights backlog | over 6,000 locations need new streetlights; over 10,000 streetlights are past their 50+ year useful life; 43 obsolete series circuits remain | CIPO 27-31 | 45 | https://www.sandiego.gov/sites/default/files/2026-02/fy-27-31-five-year-capital-infrastructure-planning-outlook.pdf |
| Citywide annual allocations: share unfunded | Street Resurfacing and Reconstruction $851,744,788 unidentified (63.40%); Flood Resilience Infrastructure $2,322,902,528 (73.06%); Stormwater Green Infrastructure $2,118,415,109 (94.40%); Sidewalk Repair and Reconstruction $149,956,770 (79.19%); Installation of City Owned Street Lights $417,606,276 (96.83%) | Vol III | 63-64 | Vol III URL |
| Facilities deferred maintenance (City Auditor estimate); break-fix work as a share of the Facilities Division's work | "likely exceed $1 billion"; 81% | IBA 26-06 | 16 | IBA 26-06 URL |
| FY 2027 needs, funding and gap for Council infrastructure priorities | needs $685.9M, funding $280.5M, gap $405.4M | IBA 26-06 | 15 | IBA 26-06 URL |

### Road condition and street repair funding

| Figure | Value | Doc | Printed page | URL |
|---|---|---|---|---|
| Street network size | over 6,600 lane miles of streets and alleys | PMP FY26 | 4 (also 23) | https://www.sandiego.gov/sites/default/files/2026-04/fy2026-pmp-update.pdf |
| 2023 average network PCI | 63 ("Fair"); was 71 in 2016 | PMP FY24 | 73 (right page of the 72-73 spread, PDF p.37) | https://www.sandiego.gov/sites/default/files/2024-01/pavement-management-plan-report.pdf |
| Share of street network in "Poor" or worse (PCI 54 or lower), 2023 | "nearly 34%"; only 20% at PCI 85 (Good) or higher | PMP FY24 | 45 (right page of the 44-45 spread, PDF p.23); also p.73 ("34% of streets currently fall into the 'Poor', 'Very Poor', 'Serious' and 'Failed' categories") | same |
| Estimated PCI entering FY26 | "approximately 65" | PMP FY26 | 23 | PMP FY26 URL |
| Projected PCI on current funding | 65 to 63 by end of FY26 (p.14); 63 in FY27 to 52 ("poor") by end of FY36 (p.15) | PMP FY26 | 14, 15 | PMP FY26 URL |
| FY26 pavement funding | $83M ($36M maintenance + $47M rehabilitation), 32% of the $259M/yr the FY24 PMP said PCI 70 needed | PMP FY26 | 13-14 | PMP FY26 URL |
| FY25 funding as % of the original PCI-70 need | 59% | PMP FY26 | 13 | PMP FY26 URL |
| 10-year need and gap to *maintain* PCI 65 (FY27-36) | $1.8B need, $0.7B anticipated, $1.1B gap | PMP FY26 | 17-18 (Tables 4-2, 4-3) | PMP FY26 URL |
| 10-year need and gap to *reach* PCI 70 (FY27-36) | $2.0B need, $1.3B gap | PMP FY26 | 18 (Table 4-3) | PMP FY26 URL |
| Prior-year (FY25 Update) need to maintain PCI 65 | $1.7B need, $1.0B gap | PMP FY25 | 14 | https://www.sandiego.gov/sites/default/files/2025-04/2025.04.30-final-pmp-update.pdf |
| FY 2027 funding needed for the PCI-65 goal | about $224M (per the PMP Update dated April 2026) | FY27 Vol III | 29 | https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3.pdf |
| FY27 pavement capital need vs. funding in the Outlook | need $229.3M, funding $36.5M, gap $192.8M | IBA 26-06; CIPO 27-31 | 15; 45 | IBA 26-06 URL; CIPO 27-31 URL |
| Five-year pavement funding in the Outlook | $291.7M (TransNet $95.8M, bonds/CP $142.5M, Road Maintenance and Rehabilitation (SB1) $41.0M in FY31 only, trench-cut fees $12.4M) | CIPO 27-31 | 45 (Table 30) | CIPO 27-31 URL |
| Pavement funding change vs. prior Outlook | −$240.4M (−45%) | IBA 26-06 | 11 | IBA 26-06 URL |
| FY27 adopted "Street Repair Program" | $96.0M (Mayor's letter) | FY27 Vol III | vii | Vol III URL |
| Equity paving goal | at least 43% of annual paving in communities with equity needs; 52% selected in FY25 for FY26 construction | PMP FY26 | 9 | PMP FY26 URL |

**Confusing or contradictory points (Q3)**
- **PCI 63 or 65?** 63 is the measured 2023 score (PMP FY24). "Approximately 65" is an estimate entering FY26, after two years of heavier paving (PMP FY26 p.23). The same document projects a drop back to 63 by the end of FY26 or FY27 (pp.14-15). No new comprehensive survey has been done since 2023. Safest wording: "63 in the last full survey (2023); the city estimates about 65 today and expects it to fall."
- **"Poor" share.** The only figure found is the 2023 one, about 34% at PCI 54 or below. No newer share was found.
- **Fire Station 51 (Skyline Hills), funded or not?** IBA 26-06 p.14 says it is "fully funded at $29.3 million in General Fund financing" *in the Outlook*. Volume III lists it as "Underfunded" (p.44) with $29,305,000 unidentified, 93.76% (p.64). Likely explanation, which is my inference and not stated in either document: the Outlook assumes future bond money that has not yet been appropriated. Present it as "planned to be funded with future borrowing".
- **Mission Beach Lifeguard Station.** IBA 26-06 p.14 says the station accounts for $43.7M of need and that its projects are funded with $35.3M ($23.3M + $10.0M + $2.0M). The table on the previous page shows lifeguard funding of $43.7M. These do not match. Volume III shows $12.6M unidentified (41.58%, p.63).
- **San Carlos Library.** IBA 26-06 counts it as funded ($20.5M) within the five years, with $17.9M more needed later. Volume III shows $38,425,388 unidentified (80.89%, p.63). This is the same timing difference as Fire Station 51.
- **The $96.0M "Street Repair Program"** (Vol III p.vii) is much larger than the FY27 capital allocations to the Street Resurfacing and Reconstruction line, which total $30.7M across funding tables on pp.7, 11 and 15 **(my arithmetic)**. The $96.0M probably includes operating-budget maintenance such as slurry seal, but the document does not break it down. Not verified.

---

## Q4. What IS being funded: the FY 2027 Adopted CIP

**Plain-English answer.** The FY 2027 Adopted Capital Improvements Program budget is **$858.1 million**. It adds new money to a multi-year program of all ongoing projects totaling **$25.59 billion**. **About 69% comes from the Water Fund ($283.7M) and Sewer Funds ($306.3M) combined (my arithmetic: 33.06% + 35.69% = 68.75%).** Those funds are paid from customer water and sewer bills and can be spent only on water and sewer systems. By department, **Public Utilities gets $580.7M (67.7%)**, Transportation $141.5M (16.5%), Stormwater $47.0M, and Parks & Recreation $33.0M. **General Fund-type borrowing (lease revenue bonds) is only $89.0M (10.4%).** That is the main flexible pot for streets, storm drains, fire stations and the like. Gas tax ($5.3M), TransNet, the regional half-cent transportation sales tax ($25.8M), and development impact fees ($19.3M) are small. Another $354.0M is "anticipated" during the year, from grants, donations, debt and impact fees, but needs separate Council approval.

**Why the water/sewer share is so large.** Water and sewer are "enterprise" utilities. They have their own dedicated revenue from customer rates, can borrow against it, and the money is legally limited to those systems. They are also capital-heavy: pipe replacement (the City awards about 40 miles of sewer pipeline work a year), treatment plants, pump stations, dams, and the multi-billion-dollar **Pure Water** recycling program. Pure Water is meant to supply nearly half of the City's drinking water by 2037 and cut reliance on imported water. General Fund assets have no dedicated revenue. They "compete for scarce resources", mainly borrowing and impact fees. So the adopted budget follows the available money, not the size of the need. Volume III says allocations are "primarily driven by availability."

**How projects are chosen.** Departments submit requests, based on the CIP Outlook, Council priorities and community input, to the Department of Finance from October to February. Two internal staff committees review them: the **Capital Improvements Program Review and Advisory Committee (CIPRAC)**, made up mainly of department managers, and the **Capital Budget Executive Review Committee (CBERC)**. Together they make a recommendation to the **Mayor**. The Mayor releases the proposed budget by April 15. The **City Council** holds hearings in May, can change the budget, and adopts it in June. An appropriations ordinance by June 30 authorizes spending.

Under **Council Policy 800-14**, each project gets a priority score out of 100. Projects compete only against projects of the same type and funding category. The score has seven weighted factors: legal compliance and risk to health, safety and environment; asset condition and level of service; equal and equitable community investment (20 points for every asset type); sustainability and conservation; funding availability; project readiness; and multi-asset benefit. Scores sort projects into High, Medium and Low thirds. **A low-scoring project can still be funded if it is the best match for a restricted funding source.** Annual "allocation" programs, such as main replacements and street resurfacing, are not scored. The IBA notes that the Council cannot change the Outlook itself. It can reprioritize flexible money, chiefly General Fund financing, during budget review (IBA 26-06 p.1 and p.17).

### Totals and sources

| Figure | Value | Doc | Printed page | URL |
|---|---|---|---|---|
| FY 2027 Adopted CIP budget | $858,083,119 ($858.1M) | FY27 Vol III | 4 (Table 1) | https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3.pdf |
| Multi-year CIP total | $25,592,846,839 ($25.59B): prior years $8.51B + FY27 $858.1M + future years $16.23B | FY27 Vol III | 6 (Table 2) | same |
| Change from FY 2026 adopted CIP | about +$14.3M | FY27 Vol I CIP | 168 | https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1cip.pdf |
| Anticipated additional FY27 funding, not in the adopted total | $354.0M | FY27 Vol III | 4 | Vol III URL |
| Projects funded in FY27 / new this year / total projects in volume | 94 / 14 / 277 | FY27 Vol III | 6 (94/14); 3 (277, Capital Budget Introduction) | Vol III URL |
| Sewer Funds | $306,253,127 (35.69%) | FY27 Vol III | 4 | Vol III URL |
| Water Fund | $283,713,764 (33.06%) | FY27 Vol III | 4 | Vol III URL |
| Bond Financing (lease revenue bonds, General Fund) | $89,030,000 (10.38%) | FY27 Vol III | 4; detail Table 3 p.7 | Vol III URL |
| Utilities Undergrounding Program Fund | $42,751,581 (4.98%) | FY27 Vol III | 4 | Vol III URL |
| TransNet Funds | $25,758,735 (3.00%) | FY27 Vol III | 4 | Vol III URL |
| Development Impact Fees | $19,326,879 (2.25%) | FY27 Vol III | 4 | Vol III URL |
| TOT Convention Center | $18,290,000 (2.13%) | FY27 Vol III | 4 | Vol III URL |
| Mission Bay Park Improvement Fund | $12,919,752 (1.51%) | FY27 Vol III | 4 | Vol III URL |
| Facilities Benefit Assessments | $11,170,000 (1.30%) | FY27 Vol III | 4 | Vol III URL |
| Enhanced Infrastructure Financing District Fund | $9,250,339 (1.08%) | FY27 Vol III | 4 | Vol III URL |
| Regional Transportation Congestion Improvement Program | $8,225,980 (0.96%) | FY27 Vol III | 4 | Vol III URL |
| Gas Tax Fund | $5,300,000 (0.62%) | FY27 Vol III | 4 | Vol III URL |
| Grants (state/federal) as an adopted FY27 line | no separate line in Table 1. Grants are part of the $354.0M "anticipated" | FY27 Vol III | 4 | Vol III URL |
| General Fund cash (direct) | no separate line in Table 1. General Fund support comes through Bond Financing | FY27 Vol III | 4, 7 | Vol III URL |
| By project type (Figure 1) | Building 31.31%, Water 19.95%, Transportation 16.49%, Wastewater 15.45%, Drainage 5.48%, Potable Reuse 4.41%, IT 3.85%, Parks 2.29%, Landfills 0.77% | FY27 Vol III | 5 | Vol III URL |
| Share of "Building" allocation that is Public Utilities buildings (paid from water/sewer funds) | 68.6% | FY27 Vol III | 5 | Vol III URL |
| By department, FY27 | Public Utilities $580,746,891 (67.68%); Transportation $141,517,284 (16.49%); Stormwater $46,983,207; Parks & Rec $33,008,301; Citywide $18,290,000; IT $15,908,536; General Services $8,096,000; Environmental Services $6,632,900; Fire-Rescue $6,400,000; Library $500,000; Police $0 | FY27 Vol III | 5-6 (Table 2) | Vol III URL |
| Mayor's letter highlights | Street Repair Program $96.0M; traffic safety $64.3M; stormwater $47.0M | FY27 Vol III | vii | Vol III URL |
| Vision Zero / traffic safety allocation | $64.3M | FY27 Vol III | 338 | Vol III URL |

### Largest named FY27 allocations

The largest single-row amounts, from the funding-source tables on Vol III pp.7-17.

| Project | FY27 amount | Funding table | Printed page |
|---|---|---|---|
| Water Main Replacements (AKB00003), annual | $114,218,850 | Water Fund | 17 |
| Sewer Main Replacements (AJA00001), annual | $105,589,259 | Sewer Funds | 14 |
| Environmental Monitoring and Technical Services Division Lab Remodel at NTC (S21003) | $45,903,956 | Sewer Funds | 13 |
| Utilities Undergrounding Program (AID00001) | $42,751,581 | Utilities Undergrounding Fund | 15 |
| Pump Stations 1 & 2 Improvements & Modernization (L24000) | $42,000,000 | Sewer Funds | 13 |
| Pure Water Program (ALA00001) | $37,855,909 **(my arithmetic: $20,600,848 Sewer p.14 + $17,255,061 Water p.16)** | Sewer + Water | 14, 16 |
| Metro Treatment Plants (ABO00001) | $36,192,353 **(my arithmetic: $29,815,688 Sewer p.13 + $6,376,665 Water p.16)** | Sewer + Water | 13, 16 |
| Flood Resilience Infrastructure (ACA00001), stormwater | $31,235,800 | Bond Financing | 7 |
| Street Resurfacing and Reconstruction (AID00005) | $30,710,132 **(my arithmetic: bonds $8,625,832 p.7 + gas tax $5,300,000 p.11 + TransNet $14,314,300 p.15 + trench cut $2,470,000 p.15)** | several | 7, 11, 15 |
| Alvarado Laboratory Improvements (L22000) | $30,000,000 **(my arithmetic: $22.5M Sewer p.13 + $7.5M Water p.16)** | Sewer + Water | 13, 16 |
| Convention Center Improvements (ABT00009), new | $18,290,000 | TOT Convention Center | 14 |
| Sidewalk Repair and Reconstruction (AIK00003) | $12,037,129 | Bond Financing | 7 |
| Mission Beach Lifeguard Station (L25001), priority score 100 | $3,400,000 | Bond Financing | 7 (score p.43) |

URL for all: https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3.pdf (or the summary section on its own: https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3summary.pdf, same printed pages)

### Prioritization and process

| Figure / fact | Value | Doc | Printed page | URL |
|---|---|---|---|---|
| Council Policy 800-14 scoring weights (Mobility assets example) | Legal/risk 25; Asset condition/level of service 25; Equity 20; Sustainability 15; Funding availability 5; Readiness 5; Multi-asset 5; total 100 (weights vary by asset class, e.g. Parks: 18/25/20/25/5/5/2) | FY27 Vol III | 43 (Table 1) | Vol III URL |
| Rules: projects compete only within the same funding category; low scorers may proceed because of funding restrictions; High/Medium/Low = top/middle/bottom third | — | FY27 Vol III | 42-43 | Vol III URL |
| Policy last updated | December 2022 | FY27 Vol I CIP | 168 | Vol I URL |
| Review committees | CIPRAC and CBERC, which recommend to the Mayor | FY27 Vol III | 4, 29-30 | Vol III URL |
| CIPRAC membership | "primarily comprised of the asset managing department's management" | FY27 Vol III | 404-405 (glossary) | Vol III URL |
| Budget calendar | Oct-Feb requests; Apr 15 Mayor's draft; May Council hearings and May Revision; June Council adoption; appropriations ordinance by June 30 | FY27 Vol III | 29-30 | Vol III URL |
| Council's role | Cannot change the Outlook, but "is the City's ultimate budget authority" and can set different capital priorities | IBA 26-06 | 1 (no printed number on first page) | IBA 26-06 URL |
| Citywide development impact fees (more flexible than neighborhood fees) | Community + Citywide DIF over FY27-31: $253.5M (Parks $171.0M) | IBA 26-06 | 8 | IBA 26-06 URL |
| WIFIA stormwater loan terms | Loan $359.2M (49%) of $733.0M in project costs; City match $373.8M (51%) | IBA 26-06 | 5 (fn 5), 10 | IBA 26-06 URL |
| Water/sewer funding restricted to those systems | water and wastewater funding "can only be used to support water and wastewater infrastructure" | IBA 26-06 | 5 | IBA 26-06 URL |
| Pure Water | up to 83 MGD by end of CY2037, "nearly half of the City's total potable water needs"; Phase I 30 MGD | CIPO 27-31 | 64; 62 | CIPO 27-31 URL |
| Wastewater pipeline pace | about 40 miles of wastewater pipeline work awarded annually; more than 250 wastewater projects; more than 275 water projects | CIPO 27-31 | 63; 61 | CIPO 27-31 URL |

**Confusing or contradictory points (Q4)**
- **Volume I contradicts Volume III on department shares.** The FY27 Volume I CIP chapter (p.167) says Public Utilities gets "$345.5 million, or 40.3 percent" and Transportation "$305.7 million, or 35.6 percent". Its own Table 2 on the next page (p.168), and Volume III (pp.5-6), show **$580.7M (67.68%)** for Public Utilities and **$141.5M (16.49%)** for Transportation. The Volume I sentence looks like stale text. **Use Volume III.**
- **Multi-year CIP total.** Volume I p.166 says "$25.2 billion"; Volume I p.168 and Volume III p.6 say $25.6B ($25,592,846,839). Some prior-year department figures also differ: Citywide $45.7M vs. $67.1M, and General Services $74.4M vs. $53.0M, in Vol I p.168 vs. Vol III p.6.
- **Volume I's project-type pie chart did not extract cleanly** (one label came out as "5.51¾"). Use the Volume III Figure 1 percentages (p.5).
- **The "Building" category is mostly water/sewer.** 68.6% of building money is Public Utilities facilities such as labs and pump stations. "Buildings 31%" should not be read as libraries and fire stations.
- **Adopted CIP vs. CIP Outlook funding.** The FY27 adopted CIP is $858.1M. The Outlook's projected FY2027 funding is $1.107B (CIPO 27-31 Table 23, p.35). The Outlook counts anticipated and not-yet-appropriated money, so the two numbers are not comparable.
- **My parse of project rows** in Volume III pp.7-17 captured 91 of 94 projects ($857.45M of $858.08M). The top-projects list is complete for large items, but a few small rows were missed.
