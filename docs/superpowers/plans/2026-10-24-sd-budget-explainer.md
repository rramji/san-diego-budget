# San Diego Budget Explainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, single-page explainer of the City of San Diego's General Fund structural deficit, built from the city's open-data CSVs plus hand-transcribed figures from IBA and budget PDFs.

**Architecture:** A Python 3 pipeline (`pipeline/`) downloads the CSVs to `data/raw/` (gitignored), validates hand-transcribed JSON in `data/curated/`, and writes small JSON files to `data/build/` (committed). A plain HTML/CSS/JS site (`site/`) fetches `../data/build/*.json` and renders four chapters with D3. The repo root is served by any static file server; the page lives at `/site/`.

**Tech Stack:** Python 3.10 stdlib (`csv`, `json`, `hashlib`, `urllib`), pytest 8; vanilla JS (ES modules), D3 v7 and d3-sankey vendored under `site/lib/`; Node 20 `node --test` for JS unit tests; `pdftotext -layout` for transcription work.

**Spec:** `docs/superpowers/specs/2026-10-23-sd-budget-explainer-design.md`

## Global Constraints

- Static site, no server, no database, no build step to view the page. Serve the repo root (`python3 -m http.server 8000`) and open `http://localhost:8000/site/`.
- Pipeline output in `data/build/` is committed and must total under 300KB.
- `data/raw/` is gitignored and untrusted. Never execute anything from it. Run every Python that reads it with `python3 -I`.
- Every hand-transcribed number is a `Figure`: `{"value": <number>, "source": {"doc": "<document title>", "page": <int or null>, "url": "<https url>"}}`. Validation rejects any Figure missing `doc` or `url`.
- Money is stored in millions of dollars in fields suffixed `_m`. Fiscal years are integers (`2027`, never `"27"`); CSV `report_fy` values like `"23"` are converted with `2000 + int(x)`.
- Layout works at 375px width with 16px side gutters and no horizontal scroll. Light and dark via `prefers-color-scheme`.
- Copy: plain words first, term in parentheses after. Neutral voice. Where the IBA and the Mayor's office differ, show both and name whose number each is.
- Load the `dataviz` skill before writing any chart code and the `frontend-design` skill before writing `styles.css`.
- Commit after every task with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A fiscal year in the CSV with blank `budget_cycle` (FY2026) must be treated as adopted and included in totals; a year with both `adopted` and `proposed` must use only `adopted`. Test in Task 2.
2. A curated Figure with a missing `url`, a non-numeric `value`, or a page given as a string must fail validation with the offending path in the message, not be silently passed through. Test in Task 3.
3. A structural-deficit year marked `reported: false` must render as a hatched "not reported" bar with no numeric label, and must be excluded from any average or sum. Test in Task 9.
4. The chapter 3 toggle must recompute every derived figure (per resident, per household, sales-tax cents, monthly fee) and the two post-cut numbers must be labeled with whose framing each is. Test in Task 12.
5. A chapter 4 claim whose data is missing (e.g. no clean management-headcount number) must render the card with the "What this doesn't tell you" line and a sentence saying no clean number exists, never an empty chart. Test in Task 13.

---

## File Structure

```
pipeline/
  __init__.py
  fetch.py          download CSVs, write data/raw/manifest.json with sha256
  csv_loader.py     read + join CSVs into plain dicts; aggregate helpers
  curated.py        load data/curated/*.json, validate Figure shape
  build.py          orchestrate: CSV aggregates + curated → data/build/*.json
  checks.py         assert build output against published figures
  bike_match.py     CIP project_name classifier for the bike-lanes claim
tests/
  fixtures/         tiny CSVs (≤ 30 rows) mirroring real headers
  test_csv_loader.py
  test_curated.py
  test_build.py
  test_bike_match.py
data/
  raw/              (gitignored)
  curated/          headline.json, structural_deficit.json, funnel.json,
                    flows.json, cuts.json, gap.json, claims.json, glossary.json
  build/            series.json, structural_deficit.json, funnel.json,
                    flows.json, cuts.json, gap.json, claims.json,
                    glossary.json, headline.json
site/
  index.html
  styles.css
  app.js            fetch JSON, mount chapters, popovers, dig-deeper, progress
  format.js         money/percent/per-capita formatting (unit-tested)
  gapcalc.js        chapter 3 arithmetic (unit-tested)
  charts/
    util.js         responsive width, theme colors from CSS tokens
    deficit-bars.js chapter 1
    funnel.js       chapter 2 primary
    sankey.js       chapter 2 dig-deeper
    claim-chart.js  chapter 4 grouped bars
  lib/
    d3.v7.min.js, d3-sankey.min.js (vendored, exact versions noted in a README)
site-tests/
  format.test.js, gapcalc.test.js, render.test.js   (node --test)
```

---

### Task 1: Repo scaffold and CSV fetcher

**Files:**
- Create: `pipeline/__init__.py`, `pipeline/fetch.py`, `tests/test_fetch.py`, `README.md`, `requirements-dev.txt` (`pytest>=8`)
- Modify: `.gitignore` (already has `data/raw/`)

**Interfaces:**
- Produces: `fetch.SOURCES: dict[str, str]` mapping short name → URL for the eight CSVs in the spec's "Machine-readable" table, keys: `operating_budget`, `operating_actuals`, `cip_budget`, `cip_actuals`, `ref_accounts`, `ref_depts`, `ref_funds`, `ref_projects`.
- Produces: `fetch.fetch_all(raw_dir: Path, sources: dict[str,str] = SOURCES, opener=urllib.request.urlopen) -> dict[str, str]` returning `{name: sha256}` and writing `raw_dir/<name>.csv` and `raw_dir/manifest.json` (`{name: {"url", "sha256", "bytes", "fetched_at"}}`).

- [ ] **Step 1: Write the failing test** in `tests/test_fetch.py`: `test_fetch_all_writes_files_and_manifest` injects a fake `opener` returning `io.BytesIO(b"a,b\n1,2\n")` for two sources, calls `fetch_all(tmp_path, sources, opener)`, asserts both `.csv` files exist, the manifest has both names, and each `sha256` equals `hashlib.sha256(b"a,b\n1,2\n").hexdigest()`.
- [ ] **Step 2: Run** `python3 -m pytest tests/test_fetch.py -v`. Expected: FAIL, `ModuleNotFoundError: pipeline`.
- [ ] **Step 3: Implement** `fetch.py` with `SOURCES` and `fetch_all` as specified; stream to disk in 1MB chunks; `fetched_at` is ISO-8601 UTC. Add `if __name__ == "__main__"` that fetches to `data/raw`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Run the real fetch** once: `python3 -I -m pipeline.fetch`. Expected: eight files in `data/raw/`, operating budget ≈ 61MB. Note the manifest's `fetched_at` in `README.md` under "Data vintage."
- [ ] **Step 6: Commit** `git add pipeline tests README.md requirements-dev.txt && git commit -m "feat: scaffold pipeline and CSV fetcher"`.

---

### Task 2: CSV loader and General Fund aggregates

**Files:**
- Create: `pipeline/csv_loader.py`, `tests/test_csv_loader.py`, `tests/fixtures/operating_budget.csv`, `tests/fixtures/ref_accounts.csv`, `tests/fixtures/ref_depts.csv`, `tests/fixtures/ref_funds.csv`

**Interfaces:**
- Produces: `csv_loader.load_budget_rows(raw_dir: Path) -> list[dict]` where each dict has keys `fy:int, cycle:str, fund_type:str, fund_number:str, dept_name:str, funds_center_number:str, account:str, account_number:str, account_type:str, amount:float`. `account_type` comes from the accounts reference join; rows whose `account_number` is absent from the reference are dropped and their count and total logged to stderr.
- Produces: `csv_loader.select_cycle(rows: list[dict]) -> list[dict]`: per FY, keep `adopted` rows if any exist for that FY, otherwise keep rows with blank cycle, and never keep `proposed`.
- Produces: `csv_loader.gf_totals_by_fy(rows) -> dict[int, dict]` with `{"revenue_m": float, "expense_m": float, "by_account_type": {account_type: float}}` for `fund_type == "General Fund"`. Expense types are exactly `{"Personnel", "Non-Personnel"}`; everything else is revenue.
- Produces: `csv_loader.gf_by_dept(rows, fy: int) -> list[tuple[str, float]]` of expense (Personnel + Non-Personnel) per `dept_name`, descending, excluding dept `"Major Revenues"`.
- Produces: `csv_loader.load_cip_rows(raw_dir) -> list[dict]` with `fy:int, cycle:str, fund_type, fund_number, dept:str, project_number, project_name, account, amount:float`.

- [ ] **Step 1: Build fixtures** mirroring real headers (`"amount","report_fy","budget_cycle","fund_type","fund_number","dept_name","funds_center_number","account","account_number"`). Include: FY23 adopted rows (one Personnel 100, one Non-Personnel 50, one Property Tax Revenue 120, one Sales Taxes 30 under dept "Major Revenues"); FY25 both adopted and proposed rows for the same account (adopted 200, proposed 999); FY26 rows with blank cycle (Personnel 300); one row with an account number not in `ref_accounts.csv`.
- [ ] **Step 2: Write failing tests**: `test_select_cycle_prefers_adopted_and_accepts_blank` (FY25 total uses 200 not 999; FY26 rows survive); `test_gf_totals_split_revenue_and_expense` (FY23 `expense_m == 150e-6` and `revenue_m == 150e-6`, `by_account_type["Property Tax Revenue"] == 120e-6`); `test_unmatched_account_dropped` (row count excludes the orphan); `test_gf_by_dept_excludes_major_revenues`.
- [ ] **Step 3: Run** `python3 -m pytest tests/test_csv_loader.py -v`. Expected: FAIL, import error.
- [ ] **Step 4: Implement** `csv_loader.py` with the signatures above using stdlib `csv.DictReader`; amounts parsed with `float(x or 0)`; `_m` values are `amount / 1e6`.
- [ ] **Step 5: Run** tests. Expected: PASS.
- [ ] **Step 6: Smoke on real data**: `python3 -I -c "from pathlib import Path; from pipeline.csv_loader import *; r=select_cycle(load_budget_rows(Path('data/raw'))); t=gf_totals_by_fy(r); print(round(t[2026]['revenue_m'],1), round(t[2026]['by_account_type']['Property Tax Revenue'],1))"`. Expected: revenue ≈ 2167 and property tax ≈ 844.6 (spec: FY2026 adopted $2,167.4M, property tax $844.6M). If revenue is off by more than 1%, stop and investigate before continuing.
- [ ] **Step 7: Commit** `feat: load and aggregate operating budget CSVs`.

---

### Task 3: Curated data schema and FY2027 headline/funnel figures

**Files:**
- Create: `pipeline/curated.py`, `tests/test_curated.py`, `data/curated/headline.json`, `data/curated/funnel.json`

**Interfaces:**
- Produces: `curated.Figure` as a `TypedDict` (`value: float, source: Source`) and `curated.Source` (`doc: str, page: int | None, url: str`).
- Produces: `curated.validate_figure(obj, path: str) -> None` raising `ValueError(f"{path}: <reason>")`.
- Produces: `curated.load(curated_dir: Path, name: str) -> dict` that reads `<name>.json` and walks it, calling `validate_figure` on every dict that has a `"value"` key.
- Produces: `data/curated/headline.json`: keys `fy` (2027) and one Figure each for `total_budget_m` (6486.9), `general_fund_m` (2256.7), `enterprise_m` (1915.1), `special_revenue_m` (1207.9), `internal_service_m` (225.7), `capital_project_m` (23.5), `cip_m` (858.1), `gf_fte` (8127.74), `gf_fte_change` (-133.66). Sources: Vol. I Executive Summary pp. 4–5, URL from spec.
- Produces: `data/curated/funnel.json`: `{"fy": 2027, "bar3": {"pension_adc_m": Figure(396.1, IBA 26-11 p.75), "debt_service_m": Figure(<transcribe from Vol. I GF Expenditures "Debt" / Citywide Program Expenditures>), "everything_else_m": Figure(derived: 2256.7 − adc − debt; source doc "derived", url to Exec Summary)}, "bar4": [{"dept": str, "amount_m": Figure}, ...] for Police, Fire-Rescue, Parks & Recreation, Library, Transportation, Homelessness Strategies & Solutions, Stormwater, Citywide Program Expenditures, and "All other" (= GF total − listed), "gap_m": Figure(118.0, IBA 26-11 p.3)}`. Bar 4 amounts come from the "General Fund Expenditures by Department" table in `fy27ab_v1generalfundexpenditures.pdf` (run `pdftotext -layout` into a scratch dir; cite the printed page number).

- [ ] **Step 1: Write failing tests**: `test_validate_figure_rejects_missing_url`, `test_validate_figure_rejects_string_page`, `test_validate_figure_rejects_non_numeric_value` (each asserts `ValueError` message starts with the given path, e.g. `"bar3.pension_adc_m"`), `test_load_walks_nested_figures` (a tmp JSON with a bad Figure three levels deep raises with the full dotted path).
- [ ] **Step 2: Run** `python3 -m pytest tests/test_curated.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `curated.py`.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Transcribe** `headline.json` and `funnel.json` from the PDFs. Download the two Vol. I PDFs to a scratch directory, `pdftotext -layout`, locate the tables, record page numbers.
- [ ] **Step 6: Verify** `python3 -I -c "from pathlib import Path; from pipeline.curated import load; h=load(Path('data/curated'),'headline'); f=load(Path('data/curated'),'funnel'); print(sum(x['amount_m']['value'] for x in f['bar4']))"`. Expected: no exception; bar4 sum within 0.5 of 2256.7.
- [ ] **Step 7: Commit** `feat: curated figure schema and FY2027 headline/funnel data`.

---

### Task 4: Build orchestrator and checks

**Files:**
- Create: `pipeline/build.py`, `pipeline/checks.py`, `tests/test_build.py`

**Interfaces:**
- Produces: `build.build_series(rows) -> dict` → `data/build/series.json`: `{"gf_by_fy": {fy: {"revenue_m", "expense_m", "by_account_type"}}, "gf_dept_by_fy": {fy: [[dept, amount_m], ...]}, "vintage": {"fetched_at": str, "sha256": {name: hash}}}` for every FY in the CSV.
- Produces: `build.build_all(raw_dir: Path, curated_dir: Path, out_dir: Path) -> list[Path]` writing `series.json`, `headline.json`, `funnel.json` (pass-through of curated, validated) and later tasks' files. Rounds every float to 3 decimals. Writes with `indent=None, separators=(",", ":")`.
- Produces: `checks.run(out_dir: Path) -> list[str]` returning failure messages (empty list = pass). Checks: FY2026 GF `revenue_m` within 1% of 2167.4; FY2026 property tax within 1% of 844.6; funnel bar4 sum within 0.5 of headline `general_fund_m`; total bytes of `out_dir/*.json` < 300_000.
- Produces: `python3 -I -m pipeline.build` runs `build_all` then `checks.run` and exits 1 with messages on failure.

- [ ] **Step 1: Write failing tests** in `tests/test_build.py` using the Task 2 fixtures and a tmp curated dir copied from `data/curated/`: `test_build_all_writes_expected_files`; `test_series_fy_keys_are_four_digit_ints` (JSON keys are strings; assert `"2023" in gf_by_fy` and `"23" not in gf_by_fy`); `test_checks_flag_size_over_300kb` (write a 301KB dummy file, assert message mentions "300").
- [ ] **Step 2: Run** `python3 -m pytest tests/test_build.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `build.py` and `checks.py`.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Run real build** `python3 -I -m pipeline.build`. Expected: exit 0, files in `data/build/`, `du -b data/build | tail -1` under 300000.
- [ ] **Step 6: Commit** `feat: build pipeline and published-figure checks` including `data/build/*.json`.

---

### Task 5: Structural deficit series (research + data)

**Files:**
- Create: `data/curated/structural_deficit.json`, `docs/research/structural-deficit-sources.md`
- Modify: `pipeline/build.py` (add `build_structural_deficit(curated, series) -> list[dict]` → `data/build/structural_deficit.json`), `tests/test_build.py`

**Interfaces:**
- Produces: `data/curated/structural_deficit.json` as a list, one entry per FY 2012..2027:
  `{"fy": int, "reported": bool, "structural_deficit_m": Figure | null, "one_time_resources_m": Figure | null, "one_time_expenditures_m": Figure | null, "suspended_reserve_m": Figure | null, "includes_suspended_reserve": bool, "components": [{"label": str, "amount_m": float}] | null, "note": str}`.
  FY2022–FY2027 come from IBA 26-11 p.78 table ("Revised Structural Deficit (excluding reserves)" row for `structural_deficit_m`, with `suspended_reserve_m` from the "Suspended General Fund Reserve Contributions" row and `includes_suspended_reserve: false`). Earlier years from each year's IBA "Review of the Proposed Budget" summary; if the review gives only a one-time-resources total, record that as `one_time_resources_m` and set `structural_deficit_m` to it with `note` saying so; if nothing is stated, `reported: false`.
- Produces: `data/build/structural_deficit.json`: the curated list with `gf_expenditure_adopted_m: float` merged from `series.gf_by_fy[fy].expense_m` (null for FY2027), plus `markers: [{"fy": 2010, "label": "Sales tax measure fails"}, {"fy": 2024, "label": "Sales tax measure fails"}, {"fy": 2025, "label": "Trash fee adopted"}, {"fy": 2028, "label": "IBA projects ~$30M gap", "source": Figure}]`.

- [ ] **Step 1: Write failing test** `test_structural_deficit_merges_gf_expenditure`: fixture curated list with FY2023 `reported: true` and FY2013 `reported: false`; assert the FY2023 entry has `gf_expenditure_adopted_m` from series and FY2013 keeps `reported: false` with `structural_deficit_m: null`.
- [ ] **Step 2: Run** test. Expected: FAIL.
- [ ] **Step 3: Implement** `build_structural_deficit` and wire into `build_all`.
- [ ] **Step 4: Run** test. Expected: PASS.
- [ ] **Step 5: Research.** For each FY 2012–2021: open `https://www.sandiego.gov/iba/reports/abr?page=N`, find "Review of the FY XXXX Proposed Budget" (also titled "...Mayor's Proposed Budget"), download to scratch, `pdftotext -layout`, `grep -n -iE "one-time|structural"` in the first 15 pages. Record the figure, page, URL, and a one-line quote in `docs/research/structural-deficit-sources.md`. Budget two hours; if a year cannot be found in that time, mark `reported: false` with `note: "IBA review not located"`.
- [ ] **Step 6: Transcribe** FY2022–FY2027 from IBA 26-11 p.78 (values in spec: structural deficit excl. reserves 96.7, 38.3, 99.5, 181.4, 48.0, 11.2; suspended reserve 10.7, 24.3, 0, 22.4, 55.6, 80.1; one-time resources 169.7, 203.4, 138.0, 222.1, 115.2, 24.8; one-time expenditures 73.0, 165.1, 38.5, 18.3, 11.6, 13.6). Note in `note` that the FY2027 row is the Proposed Budget figure and that the Adopted Budget's own residual is $23.1M (Exec Summary p.5).
- [ ] **Step 7: Rebuild and check** `python3 -I -m pipeline.build`. Expected: exit 0.
- [ ] **Step 8: Commit** `data: structural deficit series FY2012-FY2027 with sources`.

---

### Task 6: Cuts table and money-flow Sankey data (research + data)

**Files:**
- Create: `data/curated/cuts.json`, `data/curated/flows.json`
- Modify: `pipeline/build.py` (pass-through with validation; add `build_flows` that asserts every link's `source`/`target` exists in `nodes`), `tests/test_build.py`

**Interfaces:**
- Produces: `cuts.json`: `{"fy": 2027, "reductions": [{"item": str, "dept": str, "fund": "General Fund", "amount_m": Figure | null, "reason": str, "source": Source}], "restorations": [{"item": str, "amount_m": Figure | null, "source": Source}]}`. Reductions: the twelve "Critical Reductions" in Exec Summary pp. 8–9, with amounts and reasons from the matching department section of IBA 26-11 (Library p.216, Parks & Recreation p.231, Fire-Rescue p.180, Police p.262, Homelessness p.195, Transportation p.299, etc.). Restorations from IBA 26-15 and the Mayor's adoption statement (Measure C diversion, library/rec hours, arts, stormwater).
- Produces: `flows.json`: `{"fy": 2027, "nodes": [{"id": str, "label": str, "column": 0|1|2, "kind": "utility"|"restricted"|"discretionary"}], "links": [{"source": id, "target": id, "amount_m": float, "rule": str, "ref": Source, "highlight": bool}]}`. Column 0 (sources): property tax 881.0, sales tax 386.7, TOT 169.7, franchise fees 105.7, charges for services 374.7, other GF revenue (remainder to 2256.6), water & sewer rates (Enterprise, 1915.1 total, split water/sewer if Vol. I gives it, else one node), state & federal grants, gas tax / TransNet, hotel tax set-asides. Column 1 (rules): "Must go back to that utility", "Must go to what the grant or law says", "General Fund: Council decides". Column 2 (uses): Police 726-ish (use funnel bar4 values), Fire, Parks & Library, Streets, Homelessness, Pension (396.1), Bike & pedestrian projects (grant), Water & sewer systems, Other. Exactly one link has `highlight: true`: grants → restricted → bike & pedestrian projects, with `rule` naming the Active Transportation Program / TransNet restriction. Special Revenue and CIP amounts beyond the GF may be approximate; mark their `ref.doc` as "Vol. I Executive Summary, fund-type totals; allocation approximate" so the popover is honest.

- [ ] **Step 1: Write failing test** `test_build_flows_rejects_dangling_link` (a link to an unknown node id raises `ValueError` naming the id) and `test_build_flows_requires_exactly_one_highlight`.
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** `build_flows` and wire `cuts` pass-through.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Transcribe** `cuts.json` and author `flows.json` per the interfaces, from the PDFs already listed in the spec.
- [ ] **Step 6: Rebuild and check**. Expected: exit 0.
- [ ] **Step 7: Commit** `data: FY2027 cuts/restorations and money-flow graph`.

---

### Task 7: Gap figures, population, claims data, and bike-project matcher

**Files:**
- Create: `data/curated/gap.json`, `data/curated/claims.json`, `data/curated/glossary.json`, `pipeline/bike_match.py`, `tests/test_bike_match.py`
- Modify: `pipeline/build.py` (`build_claims(curated_claims, cip_rows, series) -> list[dict]`), `tests/test_build.py`

**Interfaces:**
- Produces: `gap.json`: `{"pre_cut_m": Figure(118.0), "post_cut_city_m": Figure(23.1), "post_cut_iba_m": Figure(103.2, doc "derived: 23.1 + 80.1", url Exec Summary), "skipped_reserve_m": Figure(80.1), "fy2028_projection_m": Figure(30, KPBS 2026-06-09 quoting IBA), "population": Figure(<CA DOF E-1 Jan 2026, City of San Diego>), "households": Figure(<same source or ACS 2024 1-yr>), "sales_tax_1pct_m": Figure(386.7), "cuttable_m": <funnel bar3 everything_else>}`.
- Produces: `bike_match.is_bike_project(name: str) -> bool` matching case-insensitive any of: `bike`, `bicycle`, `cycle track`, `active transportation`, `pedestrian`, and NOT `motorcycle`. `bike_match.is_road_repair(name: str) -> bool` matching `street resurfacing`, `slurry seal`, `pavement`, `pothole`, `street repair`, `road`.
- Produces: `build_claims` output `data/build/claims.json`: list of `{"id": str, "claim": str, "finding": str, "caveat": str, "chart": {"type": "grouped_bar", "fy": int, "groups": [{"label": str, "series": [{"label": str, "amount_m": float}]}]} | null, "sources": [Source], "matched_projects": [str] | null}`. For `bike-lanes`: chart groups "Bike & pedestrian projects" and "Road repair", series = CIP `fund_type` buckets for the latest CSV FY with adopted rows; `matched_projects` lists the project names. For `homelessness`: chart type `"line"`, `{"points": [{"fy": int, "amount_m": float, "share_pct": float}]}` from `series.gf_dept_by_fy` for dept names containing "Homelessness". Other three claims pass through curated `chart: null` or curated small charts.
- Produces: `claims.json` (curated) with five entries, ids `bike-lanes`, `pensions`, `managers`, `trash-fee`, `homelessness`; `finding` ≤ 4 sentences; `caveat` 1 sentence. `managers.finding` must say whether a clean position-classification number exists and, if not, say so and cite the IBA unclassified-positions discussion (IBA 26-11 p.46) and the Axios 2024 analysis as context.
- Produces: `glossary.json`: `[{"term": str, "plain": str}]` for General Fund, one-time resources, structural deficit, reserve contribution, pension ADC (pension payment the actuary says is required).

- [ ] **Step 1: Write failing tests** `test_is_bike_project_matches_and_excludes_motorcycle`, `test_is_road_repair`, and in `test_build.py` `test_build_claims_bike_chart_has_two_groups` with a CIP fixture (3 bike rows across 2 fund types, 2 road rows).
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** `bike_match.py` and `build_claims`.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Author** `gap.json`, `claims.json`, `glossary.json`. Fetch population/households from the California Department of Finance E-1 table (dof.ca.gov) or ACS; cite URL and table name.
- [ ] **Step 6: Rebuild**; inspect `data/build/claims.json` bike `matched_projects` by eye and remove false positives by tightening the matcher (add a test for each one removed).
- [ ] **Step 7: Commit** `data: gap, claims, glossary; feat: bike project matcher`.

---

### Task 8: Site shell, data loading, popovers, dig-deeper, progress

**Files:**
- Create: `site/index.html`, `site/styles.css`, `site/app.js`, `site/format.js`, `site/charts/util.js`, `site/lib/d3.v7.min.js`, `site/lib/d3-sankey.min.js`, `site/lib/README.md`, `site-tests/format.test.js`, `package.json` (`"type": "module"`, `"scripts": {"test": "node --test site-tests/"}`)

**Interfaces:**
- Produces: `format.money(m: number) -> string` (`118 → "$118M"`, `2256.7 → "$2.26B"`, `0.5 → "$500K"`), `format.pct(x, digits=0)`, `format.perPerson(m, population) -> string` (`"$84 per person per year"`), `format.cents(m, onePctM) -> string` (`118, 386.7 → "about 0.3¢ on each dollar"`).
- Produces: `app.loadData() -> Promise<{headline, series, structural, funnel, flows, cuts, gap, claims, glossary}>` fetching `../data/build/*.json`.
- Produces: `app.mountPopovers(root)`: any element with `data-src-doc`, `data-src-page`, `data-src-url` gets a `¹`-style button that opens a popover showing doc, page, link.
- Produces: `app.mountDigDeeper(root)`: `<details class="dig">` elements with `<summary>Dig deeper</summary>`; no JS required beyond analytics-free open/close.
- Produces: `util.themeColors() -> {locked, restricted, discretionary, gap, text, muted}` read from CSS custom properties; `util.observeWidth(el, cb)` via `ResizeObserver`.
- Produces: `index.html` sections with ids `ch1`, `ch2`, `ch3`, `ch4`, `sources`, `glossary`; a fixed top progress bar `#progress` whose width = scroll fraction.

- [ ] **Step 1: Load skills** `frontend-design` and `dataviz` (read; they govern `styles.css` and chart modules).
- [ ] **Step 2: Vendor D3**: download `d3@7.9.0` and `d3-sankey@0.12.3` minified builds to `site/lib/`; record versions and URLs in `site/lib/README.md`.
- [ ] **Step 3: Write failing tests** `site-tests/format.test.js` with the five examples above.
- [ ] **Step 4: Run** `npm test`. Expected: FAIL, cannot find module.
- [ ] **Step 5: Implement** `format.js`.
- [ ] **Step 6: Run** `npm test`. Expected: PASS.
- [ ] **Step 7: Write** `index.html` (four chapter sections with lead copy placeholders marked `<!-- COPY -->`, empty `<figure>` mounts `#ch1-chart`, `#ch2-funnel`, `#ch2-sankey`, `#ch2-cuts`, `#ch3-calc`, `#ch4-claims`), `styles.css` (tokens on `:root`, dark under `prefers-color-scheme`, 16px gutters, max-width 720px), `app.js` (loadData, mountPopovers, mountDigDeeper, progress bar), `charts/util.js`.
- [ ] **Step 8: Verify in browser**: `python3 -m http.server 8000` from repo root; open `http://localhost:8000/site/` with Playwright or Chrome DevTools MCP at 375px and 1200px. Expected: no console errors, headline figures render with popovers, no horizontal scroll at 375px, dark mode flips colors.
- [ ] **Step 9: Commit** `feat: site shell with data loading, popovers, dig-deeper`.

---

### Task 9: Chapter 1 chart (structural deficit bars)

**Files:**
- Create: `site/charts/deficit-bars.js`, `site-tests/render.test.js` (jsdom-free: test pure data-prep functions)
- Modify: `site/app.js`, `site/index.html` (chapter 1 copy)

**Interfaces:**
- Produces: `deficitBars.prepare(rows) -> {bars: [{fy, value_m|null, reported, components|null}], scale: [{fy, expense_m}], markers}` and `deficitBars.render(el, data, colors)`.
- Chart: one bar per FY 2012–2027; `reported: false` bars drawn with a hatched pattern fill and no value label; a faint line of `gf_expenditure_adopted_m` on a right axis; markers as thin vertical rules with labels; dig-deeper below renders FY2022–FY2027 stacked `components` bars.

- [ ] **Step 1: Write failing test** `test_prepare_excludes_unreported_from_stats`: `prepare` returns `stats.mean_m` computed only over `reported: true` bars and `bars` keeps both; a `reported:false` bar has `value_m === null`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `prepare` and `render` (D3; `<pattern>` for hatch; `role="img"` and `aria-label` summarizing peak year and value).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Write chapter 1 copy** (3–4 sentences; the 2010 and 2024 failed measures; one-time money) in `index.html`, every figure wrapped with `data-src-*`.
- [ ] **Step 6: Verify in browser** at 375px and 1200px. Expected: all bars visible, labels do not overlap at 375px (rotate or thin to every other year), hatch visible in both themes.
- [ ] **Step 7: Commit** `feat: chapter 1 structural deficit chart`.

---

### Task 10: Chapter 2 funnel

**Files:**
- Create: `site/charts/funnel.js`
- Modify: `site/app.js`, `site/index.html` (chapter 2 copy), `site-tests/render.test.js`

**Interfaces:**
- Produces: `funnel.prepare(headline, funnel) -> {bars: [{id: "total"|"locked"|"gf"|"depts", total_m, segments: [{label, amount_m, kind}]}], gapRatio: number}` where `gapRatio = gap_m / bar3.everything_else_m`; `funnel.render(el, data, colors)`.
- Bar 2 is bar 1 with non-GF segments at 35% opacity and the GF segment full. Bar 4 includes the gap drawn as a separate red segment to the right of the department segments at the same scale, not stacked into the total.

- [ ] **Step 1: Write failing test** `test_funnel_gap_ratio`: with `gap 118`, `everything_else 1700`, `gapRatio ≈ 0.0694`; and `bars[0].total_m === 6486.9`.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** `funnel.js`. Captions are rendered by the chart from a `captions` array passed in by `app.js` (copy lives in `index.html` as `data-caption-N` attributes so it is editable without touching JS).
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Write captions** (spec chapter 2, one line each, including "Department bars include each department's pension share").
- [ ] **Step 6: Verify in browser**: segment labels hide when a segment is under 40px wide and appear in a legend instead.
- [ ] **Step 7: Commit** `feat: chapter 2 funnel`.

---

### Task 11: Chapter 2 dig-deeper: Sankey and cuts tables

**Files:**
- Create: `site/charts/sankey.js`
- Modify: `site/app.js`, `site/index.html`, `site-tests/render.test.js`

**Interfaces:**
- Produces: `sankey.prepare(flows) -> {nodes, links}` in d3-sankey input form with `link.rule`, `link.ref`, `link.highlight` carried through; `sankey.render(el, data, colors, onSelect(link))`.
- Tapping a ribbon calls `onSelect`; `app.js` shows `{label, money(amount_m), rule, source popover}` in a panel beneath. On first open of the `<details>`, the highlighted link is pre-selected.
- Produces: cuts tables rendered by `app.renderCuts(el, cuts)`: columns Item, Department, Amount, Reason, Source; second table Restorations.

- [ ] **Step 1: Write failing test** `test_sankey_prepare_preserves_highlight_and_rule`.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** `sankey.js` and `renderCuts`.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Verify in browser** at 375px: Sankey switches to a vertical (top-to-bottom) layout under 600px, node labels readable, ribbon tap works via touch.
- [ ] **Step 6: Commit** `feat: money-flow sankey and FY2027 cuts tables`.

---

### Task 12: Chapter 3 gap calculator

**Files:**
- Create: `site/gapcalc.js`, `site-tests/gapcalc.test.js`
- Modify: `site/app.js`, `site/index.html` (chapter 3 copy and glossary hooks)

**Interfaces:**
- Produces: `gapcalc.compute(gap, mode: "pre_cut"|"post_cut") -> {figures: [{id: "pre_cut"|"post_cut_city"|"post_cut_iba", label: string, framing: "Both"|"City budget office"|"Independent Budget Analyst", amount_m, perPerson, perHousehold, centsPerDollar, monthlyFeePerHousehold, shareOfCuttable}]}`. In `pre_cut` mode returns one figure; in `post_cut` mode returns two (city and IBA) side by side.
- Produces: `app.mountGapToggle(el, gap)`: a two-option segmented control ("Before this year's cuts" / "After this year's cuts") that re-renders on change; the explanatory sentence from the spec appears only in post-cut mode.

- [ ] **Step 1: Write failing tests**: `test_pre_cut_single_figure` (118, population 1_400_000 → perPerson ≈ 84.29; households 540_000 → perHousehold ≈ 218.5; cents ≈ 0.305; monthly ≈ 18.2); `test_post_cut_two_framings_labeled` (two figures, framings exactly `"City budget office"` and `"Independent Budget Analyst"`, amounts 23.1 and 103.2); `test_share_of_cuttable` (118 / 1700 ≈ 0.0694).
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** `gapcalc.js` and `mountGapToggle`.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Write chapter 3 copy**, including the reserve-deposit sentence from the spec and glossary term links.
- [ ] **Step 6: Verify in browser**: toggling updates every number; post-cut shows two labeled columns stacked at 375px.
- [ ] **Step 7: Commit** `feat: chapter 3 gap calculator`.

---

### Task 13: Chapter 4 claim cards

**Files:**
- Create: `site/charts/claim-chart.js`
- Modify: `site/app.js`, `site/index.html`, `site-tests/render.test.js`

**Interfaces:**
- Produces: `app.mountClaims(el, claims)`: a row of chips (one per claim id); tapping expands exactly one card containing: claim in quotes, `finding`, chart (if `chart` non-null) via `claimChart.render(el, chart, colors)`, `matched_projects` as a collapsed list when present, "What this doesn't tell you: " + `caveat`, source links.
- Produces: `claimChart.render` supporting `type: "grouped_bar"` and `type: "line"`; when `chart` is null the card shows no figure element at all.

- [ ] **Step 1: Write failing test** `test_claim_card_model_null_chart`: a pure `claimCardModel(claim)` function returns `{hasChart: false, caveatText: "What this doesn't tell you: ..."}` for `chart: null`, and `hasChart: true` otherwise.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** `claimCardModel`, `mountClaims`, `claim-chart.js`.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Verify in browser**: all five chips; `managers` card renders text-only with caveat; `bike-lanes` chart shows two groups with fund-type series and a legend; keyboard focus moves into the opened card.
- [ ] **Step 6: Commit** `feat: chapter 4 claim checker`.

---

### Task 14: Sources, glossary, final copy pass, and acceptance checks

**Files:**
- Modify: `site/index.html`, `site/app.js`, `README.md`

**Interfaces:**
- Produces: `app.renderSources(el, data)`: deduplicated list of every `Source` found anywhere in loaded data, sorted by doc title, each a link.
- Produces: `app.renderGlossary(el, glossary)` with `id="g-<slug>"` anchors; inline glossary terms in copy link to them.

- [ ] **Step 1: Implement** `renderSources` and `renderGlossary`; replace every `<!-- COPY -->` placeholder with final copy following the Global Constraints copy rule.
- [ ] **Step 2: Run** `python3 -m pytest -q && npm test && python3 -I -m pipeline.build`. Expected: all pass, exit 0.
- [ ] **Step 3: Acceptance in browser** (Playwright or Chrome DevTools MCP), both 375px and 1200px, light and dark:
  - no console errors or failed fetches;
  - no horizontal scroll at 375px (`document.documentElement.scrollWidth <= 375`);
  - every number visible in copy has a popover (query `.figure` count equals `[data-src-url]` count);
  - the sources list has at least 8 distinct documents;
  - Lighthouse accessibility ≥ 90.
  Record screenshots to `docs/screenshots/`.
- [ ] **Step 4: Write README** sections: what this is, how to view locally, how to refresh data next year (fetch → transcribe new PDFs into curated → build → checks), data vintage.
- [ ] **Step 5: Commit** `feat: sources, glossary, final copy; docs: README`.

---

## Self-Review Notes

- Spec coverage: chapters 1–4 → Tasks 9–13; funnel + Sankey + cuts → Tasks 10–11; data sources and quirks → Tasks 1–2, 4; curated Figure rule → Task 3; headline table → Task 3; architecture → file structure; non-goals respected (no explorer, no hosting work). Glossary → Tasks 7, 14. Sources section → Task 14.
- Names used across tasks: `Figure`/`Source` (Task 3) used in 5–7; `series.gf_by_fy` / `gf_dept_by_fy` (Task 4) used in 5, 7; `funnel.bar3.everything_else_m` (Task 3) used in 7 (`cuttable_m`) and 10; `format.money` (Task 8) used in 11–13; `util.themeColors` (Task 8) used in 9–13.
- Review Focus items 1–5 are pinned to Tasks 2, 3, 9, 12, 13 respectively.
