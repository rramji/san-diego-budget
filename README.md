# San Diego Budget Explainer

A static, single-page explainer of the City of San Diego's budget, written for readers with no budget background who arrive on a phone. Every number on the page opens a footnote with the document, page and link it came from, and the page ends with a list of every source and a plain-English glossary.

The page runs in this order:

1. **The budget** (`#what`): a bar of the five pots of FY2027 money, with a "money in" and a "money out" map for each pot that open down to line items. Its Dig deeper holds the money-flow diagram (source, rule, use) and "How we built this", the methods note.
2. **Why it falls short** (`#why-short`): how little of each property-tax and sales-tax dollar the city keeps, and why its costs outgrow its income.
3. **The gap** (`#gap`): how big the FY2027 gap was, how it was closed, what is left, and what closing it would cost a resident. Its Dig deeper holds the gap timeline, the funnel of what can be cut, and the tables of cuts and restorations.
4. **What piles up** (`#piles`): the rainy-day reserve, the backlog of roads and buildings, and the pension.
5. **How long** (`#how-long`): the structural deficit year by year since FY2012.
6. **Check a claim** (`#claims`): five common claims and what the documents show.

Then the Sources list and the glossary.

There is no build step for the site and no server code: `site/` is plain HTML, CSS and ES modules (d3 and d3-sankey are vendored in `site/lib/`), and it reads the published JSON in `data/build/`.

## View it locally

From the repository root:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/site/. The page fetches `../data/build/*.json`, so serve the repository root, not `site/`. Add `?debug` to the URL to expose the loaded data as `window.__data`.

Tests: `npm test` (site helpers and chart data prep, Node's built-in test runner, no dependencies) and `python3 -I -m pytest -q` (pipeline).

Browser acceptance: `node scripts/accept.mjs` loads the page in headless Chromium at 375px and 1200px, in light and dark mode, and checks each section and the whole page: no errors, no horizontal scroll, every figure sourced with a footnote button, no retired v1 figures on screen, every in-page link lands, each source listed once under its own title. It prints `accept ok` or one `FAIL` line per problem, and refreshes the screenshots in `docs/screenshots/v2-*.png`. `node scripts/accept.mjs --smoke` runs only the load checks. It needs `playwright-core` (default path `/home/robert/node_modules/playwright-core/index.mjs`; override with `PLAYWRIGHT_CORE`) and reuses a server already on port 8000, or starts its own.

## Refresh the data next year

The page is updated by hand once a year, after the adopted budget and the IBA's reviews are published.

1. **Fetch the CSVs.** `python3 -I run.py fetch` downloads the operating and capital budget CSVs from the city's open data portal into `data/raw/` (git-ignored) and writes `data/raw/manifest.json` with URLs, SHA-256 hashes and fetch times.
2. **Transcribe the new PDFs into `data/curated/`.** The curated files are: `headline`, `funnel`, `gap`, `cuts`, `structural_deficit`, `claims`, `glossary` and `flows` (from v1); `gf_revenue_fy2027` (General Fund revenue, Table 2) and `cip_fy2027` (the adopted capital budget) for the section 1 maps; `labels` (plain names, descriptions and the four answers for each pot); and `why_short`, `gap_story` and `piles_up` for sections 2 to 4. Their names carry the year, and `pipeline/build.py` loads them by name. The adopted budget (Vol. I Executive Summary, General Fund Revenues and Expenditures) and the IBA's review of the proposed budget, May Revision review and outlook review supply the figures the CSVs cannot: headline totals, the funnel, the gap, the cuts and restorations, the new structural-deficit year and the claim cards. Every figure is a `{value, source: {doc, page, url}}` object; see `docs/data-contracts.md` for each file's shape and the build's invariants, and `docs/research/*.md` for where each number was found. The PDFs are the public URLs listed in each figure's source; keeping a local copy (with `pdftotext -layout` text for searching) is optional and not part of the repository. Never interpolate a year the IBA did not report: mark it `"reported": false`.
   - Two things live in code rather than in `data/curated/`: the chapter 1 chart markers (`DEFICIT_MARKERS` in `pipeline/build.py`, each with its own source), and the non-General-Fund Sankey amounts, which `python3 -I docs/research/flows_nongf.py` regenerates from the CSVs into `data/curated/flows.json`. That script hard-codes FY2026 (operating budget) and FY2025 (capital budget); bump both when the CSVs gain a newer adopted year.
3. **Build.** `python3 -I run.py build` validates the curated files, computes the CSV-derived series and charts, and runs the figure checks in `pipeline/checks.py` (CSV totals against published totals) on the new files in a temporary directory. Only if everything passes does it replace `data/build/*.json`; otherwise it exits non-zero and leaves `data/build/` unchanged.
4. **Check.** Run both test suites and `node scripts/accept.mjs`, then read the page at 375px and 1200px in light and dark mode. Update the copy in `site/index.html` and the section modules where years or comparisons changed. The Sources list names most documents from their footnotes; documents whose footnotes cite only parts of them are named in `TITLES` in `site/sources.js`, keyed by URL, so add the new year's reports there.

## Data vintage

- Budget figures: FY2027 Adopted Budget (published August 2026) and IBA Reports 26-11 (April 2026) and 26-15 (May 2026); earlier years from the IBA's review of each year's proposed budget, FY2012 to FY2026.
- Raw CSVs fetched 2026-10-24T16:25:44+00:00 (UTC); see `data/raw/manifest.json` for per-file URLs and hashes. The capital budget CSV's latest adopted year is FY2025 and the operating budget CSV's is FY2026; the page labels anything drawn from them with its year.
- Population and households: California Department of Finance E-5 estimates, January 1, 2026.
