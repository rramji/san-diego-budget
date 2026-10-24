# San Diego Budget Explainer: Design

Date: 2026-10-23
Owner: Robert Ramji
Status: builder check complete; awaiting Robert's approval

## Intent

A single-page web explainer that gives a reader with no knowledge of city
budgets a grounded understanding of the City of San Diego's General Fund
shortfall: how long it has been going on, where the money actually is and
what can legally be cut, what closing the gap would cost a resident, and
what the ledger says about common claims (bike lanes vs. roads, pensions,
management headcount, the trash fee, homelessness spending).

The audience is Robert's friends: curious, smart, zero budget literacy,
reading on a phone, arriving from a text message link. Success is a reader
finishing in about five minutes and being able to say something true and
specific about the budget that they could not have said before, with a
source they could point to.

## Goals

- Teach the structural deficit as a 15-year story, not a 2025 crisis.
- Make "most of the money is legally spoken for" intuitive before showing
  any cuts.
- Turn the nine-figure gap into per-person and per-household terms and
  into familiar levers (a sales tax increment, a flat fee).
- Let the reader check a specific popular claim against real numbers.
- Every number traceable to a public source with a link.

## Non-goals

- Not a general-purpose budget explorer. No free-form filtering by
  department, fund, or account. (Could be added later; not in this build.)
- Not an advocacy piece. No recommendation about what should be cut or
  taxed.
- Not real-time. Updated by hand once a year when the adopted budget and
  IBA reviews land.
- No accounts, no comments, no analytics beyond what the host provides.

## Anti-goals (what would make it a failure even if it works)

- Reading like a mayor's press release or an activist pamphlet. Neutral
  voice. Where the Independent Budget Analyst (IBA) and the Mayor's office
  frame a number differently, show both framings.
- A number on screen that cannot be traced to a document and page.
- Requiring the reader to understand "General Fund", "enterprise fund",
  "one-time resources", or "ADC" before being told what they mean in plain
  words.
- Charts that are unreadable at phone width.

## Constraints

- Static site. No server, no database. Hosted later on GitHub Pages;
  iterate locally first with any static file server.
- Data pipeline in Python 3. Produces small JSON files committed to the
  repo so the site works without re-running the pipeline.
- Front end in plain HTML, CSS, and JavaScript. Charts with D3 (builder's
  call; see below). No build step required to view the page: open
  `site/index.html` through a local static server.
- Works at 375px width. 16px side gutters. No horizontal scroll.
- Light and dark theme via `prefers-color-scheme`.
- Raw downloaded CSVs are untrusted data: keep them in `data/raw/`
  (gitignored), never execute anything from that directory, and run
  Python that reads them with `-I`.

## Source data

### Machine-readable (City Open Data Portal, PDDL license)

Direct downloads, no API, updated roughly yearly (last modified
2026-07-31):

| File | URL | Notes |
|---|---|---|
| Operating budget | https://seshat.datasd.org/operating_budget/budget_operating_datasd.csv | 549k rows, FY2011–FY2026, one row per fund / dept / account. ~61MB. |
| Operating actuals | https://seshat.datasd.org/operating_actuals/actuals_operating_datasd.csv | 664k rows, FY2011–FY2023 only. Lags ~3 years. |
| CIP budget by FY | https://seshat.datasd.org/cip_fy_budget/budget_capital_fy_datasd.csv | Capital projects with fund_type, fund_number, project_name. |
| CIP actuals by FY | https://seshat.datasd.org/cip_fy_actuals/actuals_capital_fy_datasd.csv | |
| Accounts reference | https://seshat.datasd.org/accounts_city_budget/budget_reference_accounts_datasd.csv | Join key `account_number`. Has `account_type` which separates revenue categories from `Personnel` / `Non-Personnel` expense. |
| Departments reference | https://seshat.datasd.org/departments_city_budget/budget_reference_depts_datasd.csv | Join key `funds_center_number`. |
| Funds reference | https://seshat.datasd.org/funds_city_budget/budget_reference_funds_datasd.csv | Join key `fund_number`. |
| Projects reference | https://seshat.datasd.org/projects_city_budget/budget_reference_projects_datasd.csv | |

Known quirks, verified 2026-10-23:

- Budget rows mix revenue and expense. Revenue rows live under a
  department named "Major Revenues" and under departmental revenue
  accounts. Split by joining `account_number` to the accounts reference and
  grouping on `account_type`. This reproduces the published FY2026
  property tax budget ($844.6M) within rounding.
- `budget_cycle` is `adopted` for FY2011–FY2023, both `adopted` and
  `proposed` for FY2024–FY2025, and blank for FY2026. Treat blank FY2026
  as adopted after confirming the General Fund total is ~$2,167M.
- FY2027 is not yet in the CSV. FY2027 figures come from the PDFs below.
- 12 budget rows have account numbers missing from the reference table;
  drop them and log the dropped total.

### PDFs (text layer present; `pdftotext -layout` works)

These carry the numbers the CSVs do not: structural deficit, one-time
resources, pension payment, reserves, and the reasons for cuts.

- IBA Report 25-36, Review of the FY2027–2031 Five-Year Financial Outlook
  (Dec 2025). Has the baseline revenue / expenditure / shortfall table for
  FY2026–FY2031 and the General Fund revenue projection table.
  https://www.sandiego.gov/sites/default/files/2025-12/25-36-review-of-the-mayor-s-fy-2027-2031-five-year-financial-outlook_2.pdf
- IBA Report 26-11, Review of the FY2027 Proposed Budget (Apr 2026). Has
  "General Fund Structural Deficit Over Time" table FY2022–FY2027 (one-time
  resources, one-time expenditures, structural deficit, suspended reserve
  contributions), pension section (ADC $563.2M citywide, $396.1M General
  Fund, UAL $3.46B, funded 76.1%), and per-department reviews with the
  reasons behind each cut.
  https://www.sandiego.gov/sites/default/files/2026-04/iba-report-26-11-review-of-the-fiscal-year-2027-proposed-budget_0.pdf
- IBA Report 26-15, Recommended Council Modifications and Review of the
  May Revision (Jun 2026). What Council changed from the Mayor's proposal.
  https://www.sandiego.gov/sites/default/files/2026-05/26-15-recommended-city-council-modifications-to-the-mayors-proposed-fy-2027-budget-and-review-of-the-may-revision.pdf
- IBA Report 26-25, Review of the FY2026 Year-End Report (Oct 2026). Actual
  FY2026 results; first Stability Reserve draw ($4.7M).
  https://www.sandiego.gov/sites/default/files/2026-10/26-25-iba-review-of-fy-2026-year-end-report_0.pdf
- FY2027 Adopted Budget, Volume I sections: Executive Summary (totals by
  fund type, FTEs, critical additions and reductions lists), General Fund
  Revenues (Table 2, revenue by category FY2025 actual / FY2026 / FY2027),
  General Fund Expenditures.
  https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1executivesummary.pdf
  https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1generalfundrevenues.pdf
  https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1generalfundexpenditures.pdf
- Older IBA proposed-budget reviews (FY2012 onward) for the structural
  deficit figure in each year. Listing page is plain HTML with PDF links:
  https://www.sandiego.gov/iba/reports/abr

PDF figures are transcribed by hand into `data/curated/*.json` with a
`source` field (document, page) on every number. The pipeline does not
parse PDFs automatically; that is fragile and the volume is small.

### Not used

- Questica OpenBook (cityofsandiego.openbook.questica.com): JavaScript
  app, no public API, same data as the CSVs.
- Transparent California payroll: useful for a future "management
  headcount" deep dive, but out of scope for v1 beyond citing its summary
  figure.

## Headline figures (FY2027 adopted, for orientation)

| Item | Amount | Source |
|---|---|---|
| Total city budget | $6,486.9M | Vol. I Exec Summary |
| General Fund | $2,256.7M | Vol. I Exec Summary |
| Enterprise Funds (water, sewer, airports, solid waste…) | $1,915.1M | Vol. I Exec Summary |
| Special Revenue Funds (grants, TOT, gas tax…) | $1,207.9M | Vol. I Exec Summary |
| CIP | $858.1M | Vol. I Exec Summary |
| Pension ADC, General Fund share | $396.1M (17.7% of GF) | IBA 26-11 p.75 |
| FY2027 baseline gap, Nov 2025 Outlook | $88.8M | IBA 25-36 p.5 |
| FY2027 gap at proposed budget | $118.0M | IBA 26-11 p.3 |
| Residual structural deficit after adoption | ~$23.1M (City) | Vol. I Exec Summary p.5 |
| Structural deficit, FY2025 adopted (peak) | $203.8M | IBA 26-11 p.78 |
| Deferred GF reserve contribution, FY2027 | $80.1M | Vol. I Exec Summary p.5 |
| Unfunded infrastructure, 5-yr CIP Outlook | $6.51B | IBA 25-36 p.7 |
| General Fund FTE change FY2026→FY2027 | −133.66 | Vol. I Exec Summary |

## The page

One scrolling page, four chapters, each with a short plain-English lead
(two to four sentences), one primary chart, and a collapsed "Dig deeper"
panel. A persistent thin progress indicator shows which chapter the
reader is in. Footnote markers on every figure open a small popover with
document name, page, and link. A "Sources" section at the end lists every
document once.

Decided during brainstorming (Robert's calls are marked R; mine are
marked B):

### Chapter 1: How long has this been going on? (R)

Primary chart (B, after builder check): one bar per fiscal year, FY2012
to FY2027, showing the structural deficit the IBA identified in its review
of that year's proposed or adopted budget (one-time resources used to
cover ongoing costs, net of one-time expenditures). This is the only
series that shows the problem: an adopted budget balances by construction,
so adopted revenue minus adopted expenditure from the CSV is zero every
year and must not be drawn as the gap. Behind the bars, a faint line of
total General Fund adopted expenditure from the CSV gives scale, so the
reader can see the deficit as a share of the budget.

Years where the IBA review does not state a structural figure are drawn
as a hatched "not reported" bar, never interpolated. Transcribing these
figures from roughly sixteen IBA reviews is the main research task of
chapter 1 and is on the critical path; the reports are listed at
https://www.sandiego.gov/iba/reports/abr and each review has a summary
section that states the one-time-resource reliance.

Dig deeper: for FY2022–FY2027, a stacked bar per year showing what filled
the gap (federal COVID relief, excess equity, suspended reserve
contributions, other one-time resources) from the IBA 26-11 table. For
earlier years, show the breakdown only where the IBA review itemizes it.
Add dated markers for context: 2010 sales tax measure failed, 2024 sales
tax measure failed, 2025 trash fee adopted.

Data: `data/curated/structural_deficit.json` (hand-transcribed per year,
each with source document and page, and a flag for whether suspended
reserve contributions are included; see chapter 3 for how that flag is
used), plus CSV-derived General Fund expenditure totals per year.

### Chapter 2: Where is the money, and what can actually be cut? (R)

Primary visual: the funnel. Four horizontal stacked bars, top to bottom
(B, based on R's choice of mockup A):

1. $6.49B total, segmented by fund type. Caption: everything the city
   spends.
2. Remove enterprise, special revenue, internal service, capital project
   funds and CIP. Caption: legally walled off, one sentence why ("your
   water bill can't fix a pothole; a state bike grant can't either").
3. $2.26B General Fund, segmented into pension ADC ($396.1M), General
   Fund debt service, and everything else. Caption: the part Council
   actually votes on; the first two segments are contractual.
4. The full General Fund segmented by department, gross (police, fire,
   parks, library, transportation, homelessness, all other), with the
   FY2027 gap ($118M) drawn to the same scale beside it. Caption: the gap
   is about 7% of what's cuttable, where "cuttable" is bar 3's
   "everything else." Department bars include each department's pension
   share, and the caption says so in a clause; bars 3 and 4 are therefore
   not required to nest exactly. (B, after builder check: netting ADC out
   of each department is possible from the FY2026 CSV but not from the
   FY2027 PDFs, and the teaching point does not need it.)

Fiscal year for detail (B, after builder check): all four funnel bars
are FY2027, from the PDFs. Bar 1 and bar 3 from the Executive Summary;
bar 4 from the "General Fund Expenditures by Department" table in Vol. I
General Fund Expenditures. The FY2026 CSV is used to cross-check that the
department ordering and shares are consistent, and `checks.py` asserts
CSV FY2026 General Fund totals against the published FY2026 figures, not
against FY2027. Anything drawn from FY2026 data is labeled FY2026 on
screen.

Dig deeper, part 1: the flow diagram (R chose to include both). Three
columns: revenue source → rule that governs it → what it pays for, drawn
as a Sankey. Tapping a ribbon shows the dollar amount and the rule in one
sentence (e.g. "Active Transportation Program grant: state money that can
only fund walking and biking projects"). Bike lanes are the worked example
and are highlighted on first open.

Dig deeper, part 2: table of FY2027 General Fund reductions with amount,
department, fund, and the stated reason, transcribed from Vol. I Exec
Summary "Critical Reductions" and the department sections of IBA 26-11.
A second small table lists what Council restored in June 2026 (IBA 26-15).

Data: fund-type and department totals from the FY2026 CSV cross-checked
to FY2027 PDF totals; FY2027 numbers from PDFs. Sankey ribbons from
`data/curated/flows.json`, hand-built with ~15 to 20 ribbons.

### Chapter 3: What would closing the gap cost you? (R)

Which number is "the gap" (R approved B's framing, 2026-10-24): lead
with the $118M pre-cut FY2027 gap, which both the IBA and the city's
budget office use and which readers heard in the news. A toggle, "after
this year's cuts," shows two numbers side by side: $23.1M (the city's
residual structural deficit, Exec Summary p.5) and ~$103M (the same figure
plus the $80.1M General Fund reserve contribution the budget skipped,
which the IBA treats as a one-time resource; IBA 26-11 p.78). One
sentence explains the difference in plain words: the city's Reserve Policy
calls for a rainy-day deposit each year, the FY2027 budget made almost
none, nothing was borrowed, but the obligation to catch up remains, so
the IBA counts the skipped deposit as money the budget is living on. The
IBA's ~$30M projection for FY2028 is a forward estimate of a different
quantity and belongs in chapter 1 as a marker, not in this toggle.

Show the selected gap in these terms (B):

- Per resident per year, using the most recent California Department of
  Finance E-1 population estimate for the city (~1.4M; builder to fetch
  and cite the exact figure).
- Per household per year, using the same source's household count.
- As a sales tax increment: the city's 1% Bradley-Burns share yields
  $386.7M in FY2027, so $118M ≈ 0.3 cents on the dollar. Note that a
  sales tax increase needs voter approval.
- As a flat monthly fee per household.

Alongside, the cut-only framing from chapter 2: $118M is about one dollar
in fourteen of cuttable General Fund spending.

The per-resident, per-household, sales-tax, and flat-fee figures all
recompute when the toggle changes.

Plain-language glossary entries needed by this chapter and chapter 1
(builder writes them, Robert reviews): General Fund, one-time resources,
structural deficit, reserve contribution, pension ADC.

### Chapter 4: Check a claim (R)

A row of tappable chips. Tapping one expands a card with: the claim in
quotes, what the data shows in two to four sentences, one small chart or
figure, and source links. Starter set (B, Robert to add or strike):

1. "The city prioritizes bike lanes over fixing roads." Show CIP dollars
   for bike/active-transportation projects by funding source (grant vs.
   General Fund vs. TransNet vs. other), beside road repair dollars by
   funding source, using the CIP CSV for the latest year it covers
   (FY2026) and labeled as such. Identify bike projects by `project_name`
   match in the CIP CSV; builder to document the match rule and list the
   matched projects in the card's dig-deeper. Also cite the FY2027
   General Fund cut to the multimodal team from the Exec Summary. The
   FY2027 CIP volume is not required for v1. (B, after builder check)
2. "Pensions eat the whole budget." ADC as share of General Fund (17.7%)
   and citywide (8.8%), funded ratio trend, and the "City has fully funded
   the ADC since FY2006" note.
3. "Too many managers." Position counts by classification where the data
   supports it; otherwise cite the Axios 2024 analysis and the IBA
   unclassified-position discussion with caveats. If no clean number
   exists, say so on the card.
4. "The trash fee is just a cash grab." What the fee funds, what it
   relieved the General Fund of, and the IBA's estimate of the cut needed
   if it were repealed.
5. "Homelessness spending is out of control." Department budget trend
   FY2019–FY2027 and share of General Fund.

Each card ends with "What this doesn't tell you" in one sentence, so the
page never overclaims.

### Tone and copy (R: neutral, grounding)

Plain words first, term in parentheses after: "the part Council actually
votes on (the General Fund)". No adjectives about the people involved.
Where the IBA and the Mayor's office differ, say "the city's budget office
says X; the Council's independent analyst says Y."

## Architecture

```
sandiego/
  data/
    raw/            downloaded CSVs (gitignored)
    curated/        hand-transcribed JSON from PDFs, each number with source
    build/          pipeline output JSON consumed by the site (committed)
  pipeline/
    fetch.py        download CSVs to data/raw with checksums
    build.py        CSV + curated → data/build/*.json
    checks.py       assertions (GF totals match published figures, etc.)
  site/
    index.html
    styles.css
    app.js          chapter rendering, popovers, chip cards
    charts/         one module per chart (D3)
    data/           symlink or copy of data/build
  docs/superpowers/specs/
```

Pipeline outputs are small: year-by-year totals, fund-type and department
breakdowns for FY2026, and pass-through of curated JSON. Target under
300KB total so the page loads fast on a phone.

## Left to the builder

- Exact D3 chart implementations, responsive strategy, animation on
  scroll (optional; must degrade without it).
- Sankey library choice (d3-sankey is fine).
- Whether FY2011–FY2021 structural deficit figures are worth transcribing
  from older IBA reviews for chapter 1's dig-deeper, or whether a
  revenue-vs-expense gap from the CSV is enough for those years. Transcribe
  if the reports are easy to find; otherwise note the limitation.
- Fetching the population and household figures and citing them.
- Visual design details, within the constraints above. Load the
  frontend-design and dataviz skills before building charts.

## Open questions resolved

- Shape: short story plus claim checker (R).
- Allocation chapter: funnel primary, Sankey in dig-deeper (R).
- Stack: static site, Python pipeline, plain JS + D3, GitHub Pages later
  (B, accepted by R).
- Local iteration first; no hosting work in v1 (R).
