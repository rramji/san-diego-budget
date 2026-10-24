# Structural deficit sources, FY2012–FY2027

Data: `data/curated/structural_deficit.json`. Researched 2026-10-24.

**Sign convention.** `structural_deficit_m.value` is a positive number meaning the size of the
General Fund structural gap in $ millions (the IBA table prints these as negatives in
parentheses; we store 96.7, not −96.7). The build output carries this as
`convention: "positive = size of General Fund structural gap, $ millions"`.

**Page numbers** are the printed page numbers (footer lines in `pdftotext -layout` output), not PDF indexes.

**Methods.** Per year, in order of preference:
1. *Table*: FY2022–FY2027 from IBA 26-11 p.78, row "Revised Structural Deficit (excluding reserves)";
   `includes_suspended_reserve: false`.
2. *One-time resources*: the review states a total of one-time resources used to balance the
   budget and no structural figure; `structural_deficit_m` = that total (net of one-time
   expenditures only if the review states them; none of these reviews do).
3. *Zero*: the review states no one-time reliance; value 0 with the sentence quoted.
4. *Derived sum*: the review itemizes one-time balancing resources but prints no total (FY2018–FY2020).
   `structural_deficit_m` = `one_time_resources_m` = the sum of the listed items, with `source.doc`
   starting "derived: sum of one-time resources itemized in IBA ...". Not net of one-time expenditures.
5. *Not reported*: no statement, or only a partial list (FY2016, FY2017, FY2021).

**Basis** (required `basis` field on every entry):
- `"proposed budget; gross one-time resources"` (FY2012–FY2021): the figure comes from the IBA's review of
  that year's *proposed* budget. It counts the one-time resources used to balance the budget, with no
  deduction for one-time expenditures, because none of these reviews states that offset.
- `"adopted budget; net of one-time expenditures"` (FY2022–FY2027): from IBA 26-11's retrospective table,
  one-time resources minus one-time expenditures, excluding suspended reserve contributions. Caveat: the
  table's FY2027 column is the FY2027 *Proposed* Budget (the Adopted Budget's own residual is $23.1M), but
  per the controller ruling FY2027 carries the same basis string as FY2022–FY2026.

FY2012–FY2027 used the same kind of document, the IBA "Review of the FY XXXX Proposed Budget".
FY2022–FY2027 values come from IBA 26-11's retrospective table, which covers **adopted** budgets for
FY2022–FY2026 and the **proposed** budget for FY2027. Earlier years cover the proposed budget.

| FY | structural_deficit_m | Method | Source (printed page) | Quote |
|---|---|---|---|---|
| 2012 | 35.1 (includes $14.1M suspended reserve contributions) | One-time resources | IBA 11-25, p.6 — https://www.sandiego.gov/sites/default/files/11_25.pdf | "The Mayor's budget balancing actions include $35.1 million of one-time resources- close to half of the $73.1 of balancing solutions. These actions include $14.1 million in cost savings from suspending the FY 2012 contributions to the City's reserves for the second year; $10.9 million as a result of using various available fund balances; $4.0 million recovered from CALFEMA and insurance providers ... and a $6.1 million one-time increase from federal stimulus dollars" (pp.6–7) |
| 2013 | 0 | Zero | IBA 12-16, p.2 — https://www.sandiego.gov/sites/default/files/rpt1216120427.pdf | "For the first time in six years no "one-time" solutions were used to balance the budget, nor were any services reduced." |
| 2014 | 23.7 | One-time resources | IBA 13-19, p.1 — https://www.sandiego.gov/sites/default/files/13_19_130429.pdf | "The FY 2014 budget was balanced by using approximately $19.6 million (44%) in ongoing resources and $23.7 million (56%) in one-time resources" |
| 2015 | 0 (judgment call) | Zero | IBA 14-15, p.1 — https://www.sandiego.gov/sites/default/files/14_15_140428.pdf | "With negligible use of one-time resources and sound revenue assumptions, this proposed budget and its corresponding service levels are likely more sustainable than those proposed over the past eight years." |
| 2016 | not reported | — | IBA 15-16 — https://www.sandiego.gov/sites/default/files/15_16_150427.pdf | No statement of one-time reliance or structural balance in the review. |
| 2017 | not reported | — | IBA 16-05 — https://www.sandiego.gov/sites/default/files/16_05_review_of_the_fiscal_year_2017_proposed_budget_complete_report.pdf | No statement of one-time reliance or structural balance in the review. |
| 2018 | 52.1 | Derived sum | IBA 17-16, p.2 (text pp.2–3) — https://www.sandiego.gov/sites/default/files/17_16_review_of_the_fiscal_year_2018_proposed_budget_complete_report.pdf | Chart "General Fund Mitigation Actions: $81.0 Million" itemizes one-time resources ($16.0M Pension Payment Stabilization Reserve, $15.5M Risk Management reserves, $8.3M Excess Equity, $8.3M Chargers lease termination fee, $4.0M Capital Outlay Fund); 16.0+15.5+8.3+8.3+4.0 = 52.1. No stated total or one-time-expenditure net. |
| 2019 | 32.3 | Derived sum | IBA 18-08, p.2 (continues p.3) — https://www.sandiego.gov/sites/default/files/iba_report_18-08_review_of_fy19_proposed_budget_complete_rpt.pdf | "Use of Excess Equity (One-Time) - $12.3 Million"; "Fund Balances, Transfers, and Reimbursements (One-time) - $14.4 Million"; "Workers Compensation and Long Term Disability Excess Reserve Balances (One-Time) - $5.6 Million". No total stated; 12.3+14.4+5.6 = 32.3. |
| 2020 | 44.6 | Derived sum | IBA 19-06, p.3 — https://www.sandiego.gov/sites/default/files/19_06_review_of_fy2020_proposed_budget.pdf | "38% of balancing actions are ongoing resources while 62% are one-time" (of $72.4M); items listed (Excess Equity $30.7M, LTD reserve $4.8M, Infrastructure Fund $4.0M, Public Liability reserve $2.6M, Capital Outlay $2.5M), no dollar total; 30.7+4.8+4.0+2.6+2.5 = 44.6 (61.6% of 72.4, consistent with "62%"). |
| 2021 | not reported | — | IBA 20-06, p.8 — https://www.sandiego.gov/sites/default/files/iba_report_20-06_review_of_fy21_proposed_budget.pdf | "Such one-time resources include $7.9 million in Pension Payment Stabilization Reserve funds and $16.9 million in anticipated stadium sale proceeds" — a partial list, no total. |
| 2022 | 96.7 | Table | IBA 26-11, p.78 | One-Time Resources 169.7; One-Time Expenditures 73.0; Suspended reserve 10.7; Revised Structural Deficit (excluding reserves) (96.7) |
| 2023 | 38.3 | Table | IBA 26-11, p.78 | 203.4; 165.1; 24.3; (38.3) |
| 2024 | 99.5 | Table | IBA 26-11, p.78 | 138.0; 38.5; "-"; (99.5) |
| 2025 | 181.4 | Table | IBA 26-11, p.78 | 222.1 (includes 22.4 suspended reserve counted as one-time resource); 18.3; 22.4; (181.4) |
| 2026 | 48.0 | Table | IBA 26-11, p.78 | 115.2 (includes 55.6 suspended reserve); 11.6; 55.6; (48.0) |
| 2027 | 11.2 | Table (Proposed) | IBA 26-11, p.78 | 24.8; 13.6; 80.1; (11.2). Adopted residual: "One-time resources of $40.8 million support $17.7 million in one-time uses for a net structural deficit of about $23.1 million" (FY2027 Adopted Budget Vol. I Executive Summary p.5, https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1executivesummary.pdf) |

IBA 26-11 URL: https://www.sandiego.gov/sites/default/files/2026-04/iba-report-26-11-review-of-the-fiscal-year-2027-proposed-budget_0.pdf

Context on p.78 (IBA 26-11): "The table above demonstrates that each of the City's Adopted Budgets over
the last five years were structurally imbalanced, with one-time resources exceeding one-time expenditures."

Cross-checks against the proposed-budget reviews (not used for the bars):
- FY2022, IBA 21-10 p.40: "one-time resources exceed one-time uses by approximately $91.7 million" (Proposed).
- FY2023, IBA 22-08 p.3: "resources classified as one-time in the Budget total $150.1 million, while
  expenditures classified as one-time total $104.5 million ... the City is using $45.6 million in one-time
  resources to support ongoing expenditures" (Proposed).

## FY2028 marker

KPBS, 2026-06-09, "San Diego City Council looks to close $15.3 million gap going into Tuesday's budget vote":
the structural deficit "will grow to around $30 million next year, according to Modica" (IBA Charles Modica).
https://www.kpbs.org/news/politics/2026/06/09/san-diego-city-council-looks-to-close-15-3-million-gap-going-into-tuesdays-budget-vote

## Locating IBA 12-16 (FY2013)

Cached as `pdfs/iba-12-16-fy2013-proposed.pdf`/`.txt`. Not at `12_16.pdf`. Listed on https://www.sandiego.gov/iba/reports/abr?page=10 as "Report No. 12-16"
linking to `/sites/default/files/rpt1216120427.pdf`.

## Components

FY2012 (14.1 + 10.9 + 4.0 + 6.1 = 35.1) and FY2018–FY2020 (the line items of the derived sums) carry
components. The IBA 26-11 table
does not itemize FY2022–FY2027, and the proposed-budget reviews' itemizations use different totals from
the adopted figures, so `components` is null for those years.
