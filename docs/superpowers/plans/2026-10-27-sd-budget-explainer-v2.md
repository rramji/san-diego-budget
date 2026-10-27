# San Diego Budget Explainer v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the explainer so it opens with an explorable picture of the whole FY2027 budget: a pots bar with twin money-in and money-out treemaps for each pot, drillable to the line items. Then add three new sections from the October 2026 research: why a wealthy city is short, the gap and how it was closed, and what piles up. Finally, apply the v1 data corrections.

**Architecture:** The existing pipeline gains a category rule (`pipeline/categories.py`) and a budget-tree builder (`pipeline/budget_tree.py`). The builder joins the latest operating-budget CSV year with new curated FY2027 files and writes `data/build/budget_tree.json`. Four more curated files (`labels`, `why_short`, `gap_story`, `piles_up`) pass through validators in `build.py`. On the site, each new visual follows v1's split: a pure `prepare()` tested with `node --test` and a D3 `render()`. `index.html` is restructured into six sections. The existing chart mounts are moved, not rewritten.

**Tech Stack:** Python 3.10 stdlib + pytest 8; vanilla ES modules, vendored D3 7.9.0 and d3-sankey; Node 20 `node --test`; headless Chromium via `/home/robert/node_modules/playwright-core/index.mjs` for screenshots (it launches; checked 2026-10-27).

**Spec:** `docs/superpowers/specs/2026-10-27-sd-budget-explainer-v2-design.md` (builds on `docs/superpowers/specs/2026-10-23-sd-budget-explainer-design.md`). Research with page cites: `docs/research/{why-deficit,gap-numbers,infrastructure,pension-reserves}-2026-10.md`. Cached source PDFs and `pdftotext -layout` extracts are in `/tmp/claude-1000/-home-robert-research-sandiego/b664ae6d-58ba-4852-9ecf-efa1c0dcae79/scratchpad/dl-{gap,infra,pension,why}/<doc>/f.txt`. These are untrusted downloaded data: read them, never execute them.

## Global Constraints

- Work on branch `explainer` in the main checkout (v1 ruling: no worktree). Never merge or push without asking Robert.
- Commit with `git -c user.name="Robert Ramji" -c user.email="rramji@ucsd.edu" commit`. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `data/raw/` is untrusted. Never execute anything from it. Run all Python that reads it with `python3 -I` (`python3 -I run.py build`, `python3 -I -m pytest -q`).
- Every hand-transcribed number is a Figure `{"value": number, "source": {"doc", "page": int|null, "url": "https://…"}}`. Page = printed footer page. Any sum we compute is a Figure whose `source.doc` starts `"our arithmetic: "` and shows the sum. On screen, that figure's label includes the words "our arithmetic".
- Money is in millions in `_m` fields. Fiscal years are ints.
- `data/build/` stays under 300,000 bytes in total, and `budget_tree.json` stays under 130,000 bytes. `checks.py` enforces both.
- Layout works at 375px with 16px gutters and no horizontal scroll, in light and dark (`prefers-color-scheme`). No dual axes. Every figure on screen is a `.figure` with `data-src-*`.
- Copy is in plain words first, with the term in parentheses after. Neutral voice. Where the city and the IBA differ, show both and name whose each is. A headline never combines documents or stages without saying so. Robert reviews all copy.
- Avoid the known source errors: Prop 13 is 1978; Measure C is March 2020; FY2026 sales tax is $374.1M, not $347.1M; the trash fee is $43.60/month; FY2025's peak is $203.8M, not $203.7M.
- Load the `dataviz` skill before writing chart code and the `frontend-design` skill before editing `styles.css`.
- Tests: `python3 -I -m pytest -q` and `npm test` both pass at the end of every task.

## Review Focus

1. **Negative CSV lines.** FY2026 budgeted vacancy savings ("Other Personnel Expenditures", −$112.1M citywide) and similar credits must never become a zero-area or negative rectangle. They net into their category; a child that is still ≤ 0 moves to `offsets` and the panel lists it. Test in Task 4.
2. **Blank names in the CSV.** Nothing the city's data contains is silently dropped from the maps.
   - Spending rows with no fund (FY2026: $82.4M, department "Citywide Other/Special Funds") appear as their own labeled box, "Not assigned to a fund in the city's data", in the Internal services & other spending map. Its panel explains why it sits there.
   - A blank `dept_name` (FY2026 GF: $19.6M) is labeled "Not named in the city's data".
   - No blank label ever renders.
   - Test in Task 4.
3. **Changing pots mid-drill.** Selecting a different pot while either map is drilled resets both maps to the new pot's top level and shows that pot's panel. Enter or Space on a rectangle without ⊕ shows its details without changing the path. Test in Task 6.
4. **Tiny shares at 375px.** A 0.1% child still gets a rectangle with positive width and height. It is focusable with a full `aria-label`, and it appears in the list equivalent even when its text label is hidden. Test in Task 6.
5. **Detail-year headers.** For a CSV-backed map (e.g. Utilities), the header states the children's own year and sum ("FY2026 detail: $1.70B"), never the FY2027 bar value. The pot panel says why in one sentence. Test in Task 6.

---

## File Structure

```
pipeline/
  csv_loader.py     MODIFY: rows carry account_group; helper latest_detail_fy()
  categories.py     NEW: expense_category(row), revenue_category(row), CATEGORY_ORDER
  budget_tree.py    NEW: build_budget_tree(...) and trimming helpers
  build.py          MODIFY: validators for 6 new curated files; budget_tree step; FY2028 marker
  checks.py         MODIFY: tree sums, descriptions present, size limits
data/curated/
  gf_revenue_fy2027.json  cip_fy2027.json  labels.json        NEW
  why_short.json          gap_story.json   piles_up.json      NEW
  funnel.json  gap.json  claims.json                          MODIFY (corrections)
site/
  index.html        MODIFY: six sections, new TOC and masthead
  app.js            MODIFY: load new files, mount sections
  charts/budget-map.js   NEW: squarify layout, drill state, panel/list models, render
  charts/cents-bar.js    NEW: section 2 property-tax dollar
  charts/waterfall.js    NEW: section 3 how the gap was closed
  charts/gap-timeline.js NEW: section 3 dig deeper
  charts/piles.js        NEW: section 4 reserve meter, asset bars, pension bars
  why.js  gapstory.js  piles.js    NEW: section DOM assembly (copy + figures)
  gapcalc.js  gapui.js   MODIFY: second toggle state relabelled
  styles.css        MODIFY
site-tests/
  budget-map.test.js  sections.test.js  NEW; gapcalc/render tests MODIFY
tests/
  test_categories.py  test_budget_tree.py  test_curated_v2.py  NEW
scripts/accept.mjs    NEW: browser acceptance + screenshots (not part of npm test)
docs/data-contracts.md  MODIFY in every task that changes a built file
```

Section ids, used as link targets everywhere: `what`, `why-short`, `gap`, `piles` (with sub-anchors `reserves`, `infrastructure`, `pension`), `how-long`, `claims`. Existing chart mount ids (`ch1-chart`, `ch1-dig-chart`, `ch2-funnel`, `ch2-sankey`, `ch2-cuts`, `ch3-calc`, `ch4-claims`) keep their names when they move. (Ruling: this avoids churn in app.js and the tests.)

---

### Task 1: Corrections to v1 data

**Files:**
- Modify: `data/curated/funnel.json`, `data/curated/gap.json`, `data/curated/claims.json`, `pipeline/build.py` (`DEFICIT_MARKERS`), `site/gapcalc.js`, `site/gapui.js`, `site/charts/deficit-bars.js` (marker list), `docs/data-contracts.md`
- Test: `tests/test_build.py`, `tests/test_curated.py`, `site-tests/gapcalc.test.js`, `site-tests/render.test.js`

**Interfaces:**
- Produces: `gap.json` keys `pre_cut_m, post_cut_city_m, post_cut_with_reserve_m, skipped_reserve_m, population, households, sales_tax_1pct_m` (+ injected `cuttable_m`). `fy2028_projection_m` and `post_cut_iba_m` are removed. The FY2028 marker has the shape `{fy: 2028, label, figures: [Figure, Figure]}`.

- [ ] **Step 1: Write failing tests**

```python
# tests/test_build.py
def test_v2_corrections(tmp_path):
    out, _ = _build(tmp_path)
    f = json.loads((out / "funnel.json").read_text())
    assert f["bar3"]["pension_adc_m"]["value"] == 396.3
    assert f["bar3"]["pension_adc_m"]["source"]["page"] == 30
    assert f["bar3"]["everything_else_m"]["value"] == 1785.4
    g = json.loads((out / "gap.json").read_text())
    assert "post_cut_iba_m" not in g and "fy2028_projection_m" not in g
    w = g["post_cut_with_reserve_m"]
    assert w["value"] == 103.2 and w["source"]["doc"].startswith("our arithmetic: 23.1 + 80.1")
    assert g["cuttable_m"]["value"] == 1785.4
    sd = json.loads((out / "structural_deficit.json").read_text())
    m28 = next(m for m in sd["markers"] if m["fy"] == 2028)
    assert [x["value"] for x in m28["figures"]] == [9.5, 32.9]
    assert m28["figures"][0]["source"]["page"] == 36 and m28["figures"][1]["source"]["page"] == 43
    claims = {c["id"]: c for c in json.loads((out / "claims.json").read_text())}
    assert "396.3" in claims["pensions"]["finding"] and "396.1" not in claims["pensions"]["finding"]
    assert "proposed budget" in claims["pensions"]["finding"]  # the 17.7% share is labelled as proposed-basis
    assert "June 8, 2026" in claims["trash-fee"]["finding"] and "tentative" not in claims["trash-fee"]["finding"]
```

```js
// site-tests/gapcalc.test.js: replace the post_cut fixture key and assertions
assert.deepEqual(figures.map((f) => f.id), ['post_cut_city', 'post_cut_with_reserve']);
assert.deepEqual(figures.map((f) => f.amount_m), [23.1, 103.2]);
assert.equal(figures[1].framing, 'Our arithmetic');
assert.equal(figures[1].approx, true);
// site-tests/render.test.js
test('FY2028 marker carries the city and IBA figures', () => {
  const mk = prepare(data).markers.find((m) => m.fy === 2028);
  assert.deepEqual(mk.figures.map((f) => f.value), [9.5, 32.9]);
});
```

Update `tests/test_build.py:438-441` and `:472-475` to the new keys and text. Update `site-tests/render.test.js:78` (fixture only) to 396.3.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `python3 -I -m pytest -q tests/test_build.py && npm test`. Expected: FAIL on the new assertions.

- [ ] **Step 3: Apply the corrections**

- `funnel.json`: `pension_adc_m` becomes 396.3, doc "FY2027 Adopted Budget Vol. I, Citywide Budget Overview, Table 8 (Retirement ADC, General Fund $396,300,918)", page 30. Find the URL in `docs/research/pension-reserves-2026-10.md`. `everything_else_m` becomes 1785.4.
- `gap.json`: rename `post_cut_iba_m` to `post_cut_with_reserve_m` and set its doc to "our arithmetic: 23.1 + 80.1 (the city's net structural deficit plus the skipped $80.1M reserve deposit, counted the way the IBA counted earlier stages)". Delete `fy2028_projection_m`.
- `DEFICIT_MARKERS` fy 2028: label "FY2028 outlook: city $9.5M, IBA $32.9M". `figures` holds two Figures: 9.5 (FY2027 Adopted Budget Vol. I, Citywide Budget Overview, Table 10, p.36) and 32.9 (IBA Report 26-15, p.43, excluding reserve deposits). URLs are in `docs/research/gap-numbers-2026-10.md`. Validate both with `curated.validate_figure`. Drop `KPBS_2026_06_09` if nothing else uses it.
- `deficit-bars.js` `prepare` passes `figures` through. The marker list renders each figure as a `.figure` span after the label.
- `gapcalc.js` MODES `post_cut[1]`: `{id: 'post_cut_with_reserve', label: 'Counting the skipped reserve deposit too', framing: 'Our arithmetic', key: 'post_cut_with_reserve_m', approx: true}`. `compute` copies `approx` onto each figure (default false).
- `gapui.js`: HEADINGS `'Our arithmetic': 'Counting the skipped reserve deposit too (our arithmetic)'`. An `approx` amount renders as `about $103M`.
- `claims.json` pensions finding: change $396.1M to $396.3M and say the 17.7% share is "from the proposed budget (IBA 26-11 p.75)".
- `claims.json` trash-fee finding: the Council approved the settlement June 8, 2026. It lowers the fee from July 2027 and brings back some General Fund subsidy (IBA: about $10.8M in FY2028). Take the source from `docs/research/why-deficit-2026-10.md` Q5. Keep the finding to 4 sentences or fewer.
- `data-contracts.md`: update the funnel, gap and marker lines.

- [ ] **Step 4: Rebuild and run the tests**

Run: `python3 -I run.py build && python3 -I -m pytest -q && npm test`. Expected: `build ok`, all pass.

- [ ] **Step 5: Commit** `fix(data): v2 corrections (adopted pension ADC, FY2028 pair, our-arithmetic label, trash settlement)`

---

### Task 2: Account groups and the plain-category rule

**Files:**
- Modify: `pipeline/csv_loader.py`, `tests/fixtures/ref_accounts.csv`, `tests/fixtures/operating_budget.csv`
- Create: `pipeline/categories.py`, `tests/test_categories.py`

**Interfaces:**
- Produces: each row from `load_budget_rows` gains `"account_group": str`. `latest_detail_fy(rows) -> int` returns the largest `fy` with General Fund expense rows after `select_cycle`. `categories.expense_category(row: dict) -> str` and `categories.revenue_category(row: dict) -> str` (returns `row["account_type"]`). `categories.EXPENSE_CATEGORIES: tuple[str, ...]` in display order.

- [ ] **Step 1: Write failing tests**

```python
# tests/test_categories.py
import pytest
from pipeline.categories import expense_category, EXPENSE_CATEGORIES

def r(group, account="x", typ="Personnel"):
    return {"account_type": typ, "account_group": group, "account": account}

@pytest.mark.parametrize("row,cat", [
    (r("Special Pays", "Overtime Budgeted"), "Overtime"),
    (r("Special Pays", "2nd Watch Shift"), "Salaries & other pay"),
    (r("Salaries", "Salaried Wages"), "Salaries & other pay"),
    (r("Other Personnel Expenditures", "Vacancy Factor"), "Salaries & other pay"),
    (r("Retirement ADC", "CERS - General Retirement"), "Pension payment"),
    (r("Employee Offset Savings", "CERS-UAAL Police Active"), "Pension payment"),
    (r("Workers' Compensation"), "Workers' comp"),
    (r("Flexible Benefits"), "Health & other benefits"),
    (r("Supplemental Pension Savings Plan"), "Health & other benefits"),
    (r("Internal Contracts & Services", "Equipment Rental - Motive Usage", "Non-Personnel"), "Vehicles"),
    (r("Energy and Utilities", "Fleet Fuel (Non-Discretionary)", "Non-Personnel"), "Vehicles"),
    (r("External Contracts & Services", "Consultant", "Non-Personnel"), "Contracts & services"),
    (r("IT Group 3", typ="Non-Personnel"), "Information technology"),
    (r("Debt", typ="Non-Personnel"), "Debt payments"),
    (r("Transfers Out", typ="Non-Personnel"), "Transfers to other funds"),
    (r("Capital Expenditures", "Cap Exp-Building Improvement", "Non-Personnel"), "Equipment & construction"),
    (r("Contingencies", typ="Non-Personnel"), "Other costs"),
    (r("Something New", typ="Non-Personnel"), "Other costs"),
])
def test_expense_category(row, cat):
    assert expense_category(row) == cat
    assert cat in EXPENSE_CATEGORIES

def test_loader_carries_account_group():
    from pipeline.csv_loader import load_budget_rows, latest_detail_fy
    from pathlib import Path
    rows = load_budget_rows(Path(__file__).parent / "fixtures")
    assert {r["account_group"] for r in rows} >= {"Salaries", "Supplies"}
    assert latest_detail_fy(rows) == 2026

def test_latest_detail_fy_moves_when_fy2027_appears():
    from pipeline.csv_loader import latest_detail_fy
    base = {"cycle": "adopted", "fund_type": "General Fund", "account_type": "Personnel", "amount": 1.0}
    assert latest_detail_fy([{**base, "fy": 2026, "cycle": ""}, {**base, "fy": 2027}]) == 2027
    assert latest_detail_fy([{**base, "fy": 2026, "cycle": ""}, {**base, "fy": 2027, "cycle": "proposed"}]) == 2026
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `python3 -I -m pytest -q tests/test_categories.py`. Expected: ImportError.

- [ ] **Step 3: Implement the rule.** Rules apply in this order:
  1. An `account` beginning "Overtime" → Overtime.
  2. An `account` in `VEHICLE_ACCOUNTS = {"Equipment Rental - Motive Assign", "Equipment Rental - Motive Usage", "Fleet Fuel (Non-Discretionary)", "Fleet Services Additional Vehicle Purchases", "Cap Exp-Vehicles"}` → Vehicles.
  3. Otherwise, a dict from `account_group` to category, exactly as the test table shows. Health & other benefits covers: Flexible Benefits, Medicare, Other Post-Employment Benefits, Retiree Medical Trust, Long-Term Disability, Unemployment Insurance, Supplemental Pension Savings Plan, Retirement 401 Plan, Retirement DROP, Risk Management Administration. Supplies → "Supplies". Energy and Utilities → "Energy & utilities". IT Group 1/2/3 → "Information technology".
  4. Anything else → "Other costs". (Not "Everything else", which is reserved for the roll-up node in Task 4.)

  Write the rule's docstring as the methods note: Task 12 copies it onto the page. Keep the loader's dropped-row behaviour. The fixture `ref_accounts.csv` already has `account_group`, so no fixture change is needed unless a test requires one.
- [ ] **Step 4: Run** `python3 -I -m pytest -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pipeline): plain spending categories and latest detail year`

---

### Task 3: Curated FY2027 General Fund revenue and CIP

**Files:**
- Create: `data/curated/gf_revenue_fy2027.json`, `data/curated/cip_fy2027.json`, `tests/test_curated_v2.py`
- Modify: `pipeline/build.py` (validators `build_gf_revenue`, `build_cip`)

**Interfaces:**
- Produces:
  - `gf_revenue_fy2027.json`: `{fy: 2027, total_m: Figure, categories: [{name, csv: {types: [str], include: str|null, exclude: str|null}, amount_m: Figure}]}`.
  - `cip_fy2027.json`: `{fy: 2027, total_m: Figure, sources: [{name, amount_m: Figure}], departments: [{name, amount_m: Figure, projects: [{name, amount_m: Figure}]}]}`.
  - `build_gf_revenue(d) -> d` and `build_cip(d) -> d`. Each raises `ValueError` with a path when its parts don't sum to `total_m` within 0.3, and `build_cip` appends the derived "Other sources" row.

- [ ] **Step 1: Write failing tests**

```python
# tests/test_curated_v2.py
from pathlib import Path
import pytest
from pipeline import curated
from pipeline.build import build_gf_revenue, build_cip
CUR = Path(__file__).parent.parent / "data" / "curated"

def test_gf_revenue_table2():
    d = build_gf_revenue(curated.load(CUR, "gf_revenue_fy2027"))
    by = {c["name"]: c["amount_m"]["value"] for c in d["categories"]}
    assert by == {"Property Tax": 881.0, "Sales Tax": 386.7, "Transient Occupancy Tax": 169.7,
                  "Franchise Fees": 105.7, "Property Transfer Taxes": 12.0, "Licenses & Permits": 57.8,
                  "Fines, Forfeitures, and Penalties": 45.9, "Revenue from Money and Property": 96.7,
                  "Revenue from Federal and Other Agencies": 11.8, "Charges for Current Services": 374.7,
                  "Transfers In": 111.6, "Other Revenue": 3.1}
    assert d["total_m"]["value"] == 2256.6
    assert all(c["amount_m"]["source"]["page"] == 57 for c in d["categories"])

def test_gf_revenue_sum_mismatch_names_path():
    d = curated.load(CUR, "gf_revenue_fy2027")
    d["categories"][0]["amount_m"]["value"] += 5
    with pytest.raises(ValueError, match="categories"):
        build_gf_revenue(d)

def test_cip_fy2027():
    d = build_cip(curated.load(CUR, "cip_fy2027"))
    assert d["total_m"]["value"] == 858.1
    src = {s["name"]: s["amount_m"]["value"] for s in d["sources"]}
    assert src["Sewer Funds"] == 306.3 and src["Water Fund"] == 283.7 and src["Bond Financing"] == 89.0
    other = d["sources"][-1]
    assert other["name"] == "Other sources" and other["amount_m"]["source"]["doc"].startswith("our arithmetic")
    assert abs(sum(s["amount_m"]["value"] for s in d["sources"]) - 858.1) < 0.05
    dep = {x["name"]: x["amount_m"]["value"] for x in d["departments"]}
    assert dep["Public Utilities"] == 580.7 and dep["Transportation"] == 141.5 and "Police" not in dep
    for x in d["departments"]:
        assert sum(p["amount_m"]["value"] for p in x["projects"]) <= x["amount_m"]["value"] + 0.05
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FileNotFoundError.
- [ ] **Step 3: Transcribe the GF revenue file.**
  - `gf_revenue_fy2027.json` holds the 12 rows of Vol. I General Fund Revenues Table 2, FY2027 Adopted column, all on p.57. URL: `https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1generalfundrevenues.pdf`. `total_m` is 2256.6.
  - `csv` mapping to FY2026 CSV `account_type`:
    - Property Tax → Property Tax Revenue
    - Sales Tax → Sales Taxes
    - Transient Occupancy Tax → Transient Occupancy Taxes
    - Franchise Fees → Other Local Taxes, `exclude: "Transfer"`
    - Property Transfer Taxes → Other Local Taxes, `include: "Transfer"`
    - Licenses & Permits → Licenses and Permits
    - Fines → Fines Forfeitures and Penalties
    - Money and Property → Revenue from the Use of Money and Property
    - Federal and Other → Revenue from Federal Agencies + Revenue from Other Agencies
    - Charges, Transfers In and Other Revenue → their same-named types
  - Confirm the property transfer tax account name contains "Transfer" by reading `data/raw/ref_accounts.csv`.
- [ ] **Step 4: Transcribe the CIP file and implement the validators.**
  - `cip_fy2027.json` comes from `docs/research/infrastructure-2026-10.md` Q4 (FY27 Vol. III, `https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v3.pdf`).
    - Sources: the 12 named lines of Table 1, p.4, in millions to 1 decimal. `build_cip` appends "Other sources" = total − sum, as an our-arithmetic Figure.
    - Departments: the Table 2 rows, pp.5–6, omitting Police ($0).
    - Projects: the largest-allocations table. Confirm each project's department on its project page in the cached `dl-infra/v3full/f.txt` before you place it, and cite that page. Leave out any project whose department you can't confirm.
    - Multi-fund projects (Pure Water, Metro Treatment Plants, Alvarado Lab, Street Resurfacing) use the research file's our-arithmetic sums, labeled as such.
  - Implement both validators.
- [ ] **Step 5: Run** `python3 -I -m pytest -q`. Expected: PASS.
- [ ] **Step 6: Commit** `data: FY2027 General Fund revenue (Table 2) and adopted CIP`

---

### Task 4: Budget tree builder

**Files:**
- Create: `pipeline/budget_tree.py`, `tests/test_budget_tree.py`
- Modify: `pipeline/build.py` (`_build_into` gains step `("budget_tree", …)`, which needs `labels.json`; Task 5 fills it, and this task commits a minimal valid one with empty `nodes`), `pipeline/checks.py`, `tests/test_build.py` (expected file list), `tests/test_checks.py`, `docs/data-contracts.md`

**Interfaces:**
- Consumes: `expense_category`, `revenue_category`, `latest_detail_fy`, `build_gf_revenue`, `build_cip`, `curated.load`.
- Produces: `build_budget_tree(rows, fund_names: dict[str, str], headline, funnel, gf_revenue, cip, labels) -> dict`, where `fund_names` maps `fund_number` to `fund_name` from `ref_funds.csv`. `budget_tree.json`:

```
{bar_fy: 2027, detail_fy: 2026, total_m: Figure,
 sources: {"s0": Source, ...},                 # each distinct Source once
 descs: {key: {text, src|null, link|null}},    # copied from labels (Task 5)
 unassigned: {value_m: number, dept_name: str} | null,   # spending rows with no fund (shown as a box, see Rules)
 unmatched: {rows: int, value_m: number},                 # rows the loader drops: account code missing from the city's account list
 pots: [Pot × 5]}                              # order: general_fund, utilities, purpose, cip, internal
Pot  = {id, label, value_m, src, answers: {what, money_from, committed_to, who_decides: {text, src}} | null,
        in: Node, out: Node}
Node = {name, key, value_m, fy, src, children: [Node] | null, offsets: [{name, value_m}] | null}
```

The `label` values for the five pots are "General Fund", "Utilities", "Money tied to a purpose", "Construction projects" and "Internal services & other". Pot `value_m` comes from headline: `general_fund_m`, `enterprise_m`, `special_revenue_m` and `cip_m`. The internal pot is `internal_service_m + capital_project_m` = 249.2, an our-arithmetic source.

**Levels:**

| Pot | Money in | Money out |
|---|---|---|
| General Fund | 12 Table 2 categories, FY2027 → FY2026 accounts | 9 funnel bar4 depts, FY2027 → categories → accounts |
| Utilities | Enterprise Funds revenue types → accounts | funds → categories → accounts |
| Money tied to a purpose | Special Revenue Funds revenue types → accounts | funds → categories → accounts |
| Construction projects | CIP sources (curated) | CIP departments (curated) → projects |
| Internal services & other | Internal Service + Capital Project Funds revenue types → accounts | funds → categories → accounts |

GF out "All other" (387.1) → the FY2026 departments not among the eight named. Funnel department names map to CSV names through `FUNNEL_TO_CSV_DEPT = {"Citywide Program Expenditures": "Citywide Expenses"}`; every other name matches as is. GF revenue rows are all non-expense GF rows. Expense rows exclude dept "Major Revenues" (as `gf_by_dept` does).

**Rules** (constants in `budget_tree.py`):
- `MAX_CHILDREN = 10`, counting "Everything else". Keep the 9 largest and roll the rest into an "Everything else" node whose children are the rolled items, trimmed the same way. This repeats down the levels.
- `ACCOUNT_LEVEL_MIN_M = 10.0`: a category gets account-level children only if its value is at least this. Raise it (and note why) if `budget_tree.json` exceeds 130,000 bytes.
- Depth: at most 3 named levels below a map root. "Everything else" hops don't count toward the 3.
- Children with net value ≤ 0 go to the parent's `offsets`, not `children`. `value_m` of a CSV node is its net sum, including offsets.
- `key` is the description lookup:
  - For a revenue type or expense category, the category name.
  - For a department, CSV fund or curated row, its name.
  - For an account, its category's key.
  - "Everything else" → `"_everything_else"`.
- Blank `dept_name` gets the name "Not named in the city's data" and key `"_unnamed"`.
- **Expense rows with blank `fund_type` are shown, not dropped.** They become one child of the `internal` pot's `out` root:
  - name "Not assigned to a fund in the city's data", key `"_no_fund"`;
  - its children are the plain categories, as for any fund;
  - `unassigned` records its total and department.
  
  (Ruling, from Robert 2026-10-27: label it in the maps rather than hide it. The internal pot is the "& other" pot, so it is the least misleading home. The panel says we can't tell which pot it belongs to.)
  
  In the 2026-10-24 CSV vintage, these are 2 rows, totaling $82,396,353:
  - "City Services Billed", $33.8M;
  - "Miscellaneous Professional/Technical Ser", $48.6M.
- `unmatched` records what `load_budget_rows` drops: rows whose account code isn't in `ref_accounts.csv`. Expose it with a new `csv_loader.unmatched_rows(raw_dir) -> list[dict]`. In the current vintage that is 12 rows, $83.1M:
  - 6 rows with no fund and no account, totaling exactly $82,396,353 (an unexplained mirror of the two rows above);
  - 6 General Fund rows with no account, $0.67M (City Planning, Police).
  
  These can't be drawn because we can't tell whether they are spending or income. The methods note (Task 12) states them, with amounts.
- Map roots are named `"<pot label> money in"` / `"<pot label> money out"` (crumbs start there).
- Every Source goes through a registry that returns stable keys `s0, s1, …`. CSV nodes cite `{doc: f"City of San Diego open data: operating budget CSV, FY{detail_fy} adopted", page: None, url: "https://seshat.datasd.org/operating_budget/budget_operating_datasd.csv"}`.

- [ ] **Step 1: Write failing tests** (synthetic rows built in the test, plus the real curated files)

```python
# tests/test_budget_tree.py: helpers make rows {fy, cycle, fund_type, fund_number, dept_name, account, account_group, account_type, amount}
def test_pots_and_bar_values(tree):
    assert [p["id"] for p in tree["pots"]] == ["general_fund", "utilities", "purpose", "cip", "internal"]
    assert [p["value_m"] for p in tree["pots"]] == [2256.7, 1915.1, 1207.9, 858.1, 249.2]
    assert tree["sources"][tree["pots"][4]["src"]]["doc"].startswith("our arithmetic")

def test_gf_top_levels_are_fy2027(tree):
    gf = tree["pots"][0]
    assert gf["in"]["fy"] == 2027 and gf["in"]["value_m"] == 2256.6
    assert len(gf["in"]["children"]) == 10 and gf["in"]["children"][-1]["name"] == "Everything else"
    assert [c["name"] for c in gf["out"]["children"]][:2] == ["Police", "Fire-Rescue"]
    police = gf["out"]["children"][0]
    assert police["fy"] == 2027 and police["value_m"] == 718.3
    assert all(c["fy"] == 2026 for c in police["children"])

def test_negative_lines_become_offsets(tree_from_rows):
    # dept with Salaries +100 and a vacancy line −30 in group "Other Personnel Expenditures", and Contingencies −5
    d = tree_from_rows.find("utilities", "out", "Water Fund")
    sal = next(c for c in d["children"] if c["name"] == "Salaries & other pay")
    assert sal["value_m"] == 70.0
    assert d["offsets"] == [{"name": "Other costs", "value_m": -5.0}]
    assert all(c["value_m"] > 0 for c in walk(tree_from_rows.tree))

def test_blank_names(tree_from_rows):
    names = [n["name"] for n in walk(tree_from_rows.tree)]
    assert "" not in names and "Not named in the city's data" in names
    internal_out = next(p for p in tree_from_rows.tree["pots"] if p["id"] == "internal")["out"]
    nf = next(c for c in internal_out["children"] if c["key"] == "_no_fund")  # fixture expense row of 82.4M with fund_type ""
    assert nf["name"] == "Not assigned to a fund in the city's data" and nf["value_m"] == 82.4
    assert tree_from_rows.tree["unassigned"]["value_m"] == 82.4
    assert tree_from_rows.tree["unmatched"]["rows"] >= 1   # fixture row with account 999999

def test_trimming_and_depth(tree_from_rows):
    for n in walk(tree_from_rows.tree):
        assert n["children"] is None or len(n["children"]) <= 10
    assert max_named_depth(tree_from_rows.tree) <= 3

def test_same_year_children_sum_to_parent(tree):
    for n in walk(tree):
        if n["children"] and all(c["fy"] == n["fy"] for c in n["children"]):
            s = sum(c["value_m"] for c in n["children"]) + sum(o["value_m"] for o in n["offsets"] or [])
            assert abs(s - n["value_m"]) <= 0.01 * n["value_m"]

def test_detail_fy_follows_csv(tree_from_rows_with_fy2027):
    assert tree_from_rows_with_fy2027.tree["detail_fy"] == 2027
```

Add to `tests/test_checks.py`:
- `checks.run` fails when `budget_tree.json` is ≥ 130,000 bytes.
- `checks.run` fails when a same-year node's children miss its value by more than 1%.

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement `build_budget_tree`.** Wire it into `_build_into` and add the two checks to `checks.py`. The checks reuse the same-year rule above: different-year children are detail and are not checked against an FY2027 parent.
- [ ] **Step 4: Run** `python3 -I run.py build && python3 -I -m pytest -q`. Expected: `build ok`, PASS. Record `wc -c data/build/budget_tree.json` in the commit body.
- [ ] **Step 5: Document** the `budget_tree.json` contract in `docs/data-contracts.md`.
- [ ] **Step 6: Commit** `feat(pipeline): budget tree for the section 1 drill-down maps`

---

### Task 5: Descriptions and the four pot answers (`labels.json`)

**Files:**
- Modify: `data/curated/labels.json`, `pipeline/build.py` (`build_labels`), `pipeline/checks.py`, `tests/test_curated_v2.py`, `tests/test_checks.py`

**Interfaces:**
- Produces: `labels.json = {pots: {<pot id>: {what, money_from, committed_to, who_decides: {text, source: Source}}}, nodes: {<key>: {text, source: Source, link: str|null}}, categories: {<key>: {text, link: str|null}}}`. `build_labels(d) -> d` validates:
  - all 5 pots × 4 answers are present, with non-empty text and valid sources;
  - each node text has at most 2 sentences;
  - `link` ∈ {`#why-short`, `#gap`, `#reserves`, `#infrastructure`, `#pension`, `#how-long`, `#claims`, null}.
  
  The tree builder copies these into `descs`, with node entries taking `src` from the registry.

- [ ] **Step 1: Write failing tests**

```python
def test_labels_cover_pots_and_links():
    d = build_labels(curated.load(CUR, "labels"))
    assert set(d["pots"]) == {"general_fund", "utilities", "purpose", "cip", "internal"}
    assert d["nodes"]["Property Tax"]["link"] == "#why-short"
    assert d["nodes"]["Stormwater"]["link"] == "#infrastructure"
    assert d["categories"]["Pension payment"]["link"] == "#pension"
    assert d["categories"]["_everything_else"]["text"]

def test_labels_reject_three_sentences_and_unknown_link(): ...  # two pytest.raises cases, message names the key
```

`checks.py` gains a rule: every level-1 child of the `in` and `out` maps of `general_fund`, and of the `out` maps of `utilities` and `purpose`, has a `descs[key]` entry. Otherwise the check fails, listing the missing names. That is about 38 named items. `descs["_no_fund"]` is also required. Its text says the city's data lists this spending under "Citywide Other/Special Funds" with no fund, so we can't tell which pot it belongs to, and that it is shown here rather than left out. CIP and internal items may fall back to their category text. Test it in `tests/test_checks.py`.

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Write the copy.** Pot answers come from the research files and the FY2027 Vol. I sections (cached text in `dl-gap/ab27v1`, `dl-pension/fy27full`). Use `docs/research/source-pdf-index.md` for URLs. Each answer is 1–3 plain sentences:
  - "what it is";
  - "where its money comes from";
  - "what it's committed to": the legal restriction, debts it is paying, and costs it can't skip;
  - "who decides".
  
  The CSV-backed pots (utilities, purpose, internal) end `what` with the sentence: "The detail below is from last year's budget (FY2026), because this year's line-by-line data isn't published yet." Node descriptions are 1–2 cited sentences. Category texts are one shared plain definition each, with no source.
- [ ] **Step 4: Run** `python3 -I run.py build && python3 -I -m pytest -q`. Expected: PASS, with no missing-description failures.
- [ ] **Step 5: Commit** `copy: plain descriptions and four answers per pot (for Robert's review)`

---

### Task 6: `budget-map.js` pure logic

**Files:**
- Create: `site/charts/budget-map.js` (pure exports only in this task), `site-tests/budget-map.test.js`

**Interfaces:**
- Consumes: the `budget_tree.json` contract (Task 4).
- Produces:
  - `layout(items: {value_m}[], x, y, w, h) -> {item, x, y, w, h}[]`: squarified. It uses `max(value_m, 0)` and gives every positive item w, h ≥ 0.5.
  - `createState(tree) -> {pot: 'general_fund', in: Node[], out: Node[], selected: {side, node} | null}`. Each path is a `Node[]` from the map root.
  - `selectPot(state, tree, potId) -> state`, which resets both paths and sets `selected: null`.
  - `activate(state, side, node) -> state`: drills in if `node.children`, else only sets `selected`.
  - `goUp(state, side, depth) -> state`: truncates the path to `depth + 1`.
  - `mapHeader(node, tree) -> {text, total_m, fy, isDetail}`:
    - `isDetail` when the children's fy ≠ `tree.bar_fy` or ≠ the node's fy;
    - `total_m` = sum of children + offsets;
    - `text` is `"FY2026 detail: $1.70B"` or `"FY2027: $2.26B"`.
  - `crumbs(path) -> {name, depth, current}[]`.
  - `nodePanel(node, parent, tree) -> {title, amount_m, share, fy, text, src, link, opens, offsets}`.
  - `potPanel(pot, tree) -> {title, value_m, share, answers: [{q, text, src}] × 4, notes: string[]}`. `notes` includes the in/out mismatch sentence when the two map totals differ by more than 1%.
  - `listModel(node) -> {name, value_m, opens}[]`.

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import * as bm from '../site/charts/budget-map.js';
const tree = JSON.parse(readFileSync(new URL('../data/build/budget_tree.json', import.meta.url), 'utf8'));
test('layout areas proportional, inside bounds, tiny items visible', () => {
  const items = [500, 300, 150, 49, 1].map((v) => ({ value_m: v }));
  const r = bm.layout(items, 0, 0, 320, 240);
  const tot = 320 * 240;
  r.forEach((q, i) => {
    if (i < 4) assert.ok(Math.abs(q.w * q.h - (items[i].value_m / 1000) * tot) < 0.01 * (items[i].value_m / 1000) * tot);
    assert.ok(q.x >= -1e-9 && q.y >= -1e-9 && q.x + q.w <= 320 + 1e-9 && q.y + q.h <= 240 + 1e-9);
    assert.ok(q.w >= 0.5 && q.h >= 0.5);
  });
  assert.deepEqual(bm.layout([], 0, 0, 10, 10), []);
});
test('activate drills only nodes with children; pot change resets both maps', () => {
  let s = bm.createState(tree);
  const police = s.out[0].children.find((c) => c.name === 'Police');
  s = bm.activate(s, 'out', police);
  assert.equal(s.out.length, 2);
  const leafParent = s.out[1]; const leaf = leafParent.children.find((c) => !c.children) ?? null;
  if (leaf) { const s2 = bm.activate(s, 'out', leaf); assert.equal(s2.out.length, 2); assert.equal(s2.selected.node, leaf); }
  s = bm.selectPot(s, tree, 'utilities');
  assert.equal(s.pot, 'utilities'); assert.equal(s.out.length, 1); assert.equal(s.in.length, 1); assert.equal(s.selected, null);
  assert.equal(bm.goUp(bm.activate(s, 'out', s.out[0].children[0]), 'out', 0).out.length, 1);
});
test('detail header for a CSV pot uses the children sum, never the bar value', () => {
  const u = tree.pots.find((p) => p.id === 'utilities');
  const h = bm.mapHeader(u.out, tree);
  assert.equal(h.isDetail, true); assert.match(h.text, /^FY2026 detail: \$1\.\d\dB$/);
  assert.notEqual(h.total_m, 1915.1);
  assert.match(bm.potPanel(u, tree).answers[0].text, /last year's budget/);
});
test('crumbs mark only the last step current; panel share and opens', () => { /* exact on GF out › Police */ });
test('list model includes every child, including tiny ones', () => { /* length equals children length */ });
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement the pure exports.** Keep the module importable in Node: no DOM or d3 at the top level, matching `deficit-bars.js`. Use the squarify algorithm from the approved mockup (`.superpowers/brainstorm/1003204-1793084730/content/opener-v2.html`, function `squarify`), with the 0.5 minimum added.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(site): budget map layout, drill state and panel models`

---

### Task 7: Six-section page shell

**Files:**
- Modify: `site/index.html`, `site/app.js`, `data/curated/glossary.json`, `site/styles.css`, `tests/test_build.py` (glossary count if asserted)

**Interfaces:**
- Produces: section ids and mount ids that Tasks 8–12 fill:
  - `#what`: `s1-pots`, `s1-maps`, `s1-panel`; Dig deeper holds `ch2-sankey`.
  - `#why-short`: `s2-cents`, `s2-blocks`; Dig deeper holds `s2-dig`.
  - `#gap`: `s3-headlines`, `s3-waterfall`, `s3-residual`, `s3-debt`, `ch3-calc`; Dig deeper holds `s3-timeline`, `ch2-funnel`, `ch2-cuts`.
  - `#piles` with `#reserves` (`s4-reserve`), `#infrastructure` (`s4-assets`, `s4-roads`, dig `s4-infra-dig`) and `#pension` (`s4-pension`, `s4-payers`).
  - `#how-long`: the existing ch1 mounts.
  - `#claims`: `ch4-claims`.
  - Sources and glossary sections stay as they are.

- [ ] **Step 1: Restructure `index.html`.**
  - Title "San Diego's city budget, explained".
  - The dek answers "what is this page", in two sentences, with no gap figure.
  - TOC has 6 entries plus Sources and Glossary.
  - Each section has its question heading from the spec, a `<p class="lead">` placeholder that the section's task fills, its mounts, and a `details.dig`.
  - Move the existing funnel, Sankey, cuts, calc, ch1 and claims markup, with their `data-caption-*` attributes, into their new places.
  - The v1 ch2 lead and the v1 ch3 dig copy are deleted. Their content returns in Tasks 8 and 10.
  - `#how-long` lead: rewrite the ch1 lead so it no longer assumes it is first. It keeps its `data-fy-fig` / `data-fy-top` spans.
- [ ] **Step 2: Add glossary entries.** Add 7 entries to `glossary.json`, each `{term, plain}` in 1–2 sentences: Utility (enterprise) fund, Special revenue fund, Capital Improvements Program (CIP), Unfunded liability, Funded ratio, Reserve (rainy-day fund), Pavement Condition Index (PCI).
- [ ] **Step 3: Rewire `app.js`.**
  - `FILES` adds `budget_tree`, `why_short`, `gap_story`, `piles_up`. The last three are created as `{}` stubs in `data/curated/` and passed through `build.py` until their tasks, so `loadData` doesn't 404.
  - `guarded()` names follow the new sections.
  - The existing renderers still target the same mount ids.
- [ ] **Step 4: Verify.**
  - Run `python3 -I run.py build && python3 -I -m pytest -q && npm test`.
  - Serve the repo root with `python3 -m http.server 8000`.
  - Run `node scripts/accept.mjs --smoke`. This creates the script with a `--smoke` mode: load `/site/` at 375 and 1200, light and dark; assert no `pageerror` and `scrollWidth <= innerWidth`; assert `#ch1-chart svg`, `#ch2-funnel svg` and `#ch4-claims` are present. The playwright-core path defaults to `/home/robert/node_modules/playwright-core/index.mjs` and is overridable with `PLAYWRIGHT_CORE`.
  - Expected: `smoke ok`.
- [ ] **Step 5: Commit** `refactor(site): six-section page order (budget first)`

---

### Task 8: Section 1, pots bar, twin maps, panel

**Files:**
- Modify: `site/charts/budget-map.js` (add `render(el, state, tree, colors, handlers)`), `site/app.js` (`renderWhat`), `site/index.html` (`#what` lead), `site/styles.css`, `scripts/accept.mjs`

**Interfaces:**
- Consumes: Task 6's exports and Task 7's mount ids.
- Produces: `renderWhat(data)` in `app.js`.

- [ ] **Step 1: Write the lead.** The `#what` lead has 2–4 sentences: the city plans to spend `total_m` this year; most of it is walled off by law into pots; only the General Fund is general-purpose. Its figures come from `headline.json` (`data-hl-fig`). Below the lead goes one hint line: "Tap a pot, then any box marked ⊕ to open it."
- [ ] **Step 2: Render the pots bar.**
  - One SVG bar of five `<g role="button" tabindex="0">` segments, sized by `value_m` over the five-pot sum.
  - Each segment's `aria-label` reads "<label>, <money>, <pct> of the budget".
  - Labels show where they fit; the pot names are also listed as a legend below the bar.
  - Hover dims the others. The General Fund starts selected, with a 3px outline in `--text`.
- [ ] **Step 3: Render the twin maps.**
  - `s1-maps` is a two-column grid; below 640px it is one column with money in first.
  - Each map has a heading ("Money in" / "Money out"), a crumbs line (links for non-current steps, which call `goUp`), and a `mapHeader().text` line.
  - The SVG draws `layout()` rectangles. Fill comes from a 10-colour categorical palette chosen with the dataviz skill and validated in both themes.
  - Labels show when they fit (name + money, plus "⊕" when the item opens). Each rect has `role="button" tabindex="0"` and an `aria-label` with name, money, share, and "opens further" when it does.
  - Click, Enter or Space calls `activate`. Then re-render that map only and move focus to the first rect of the new level, or keep it on the same rect for a leaf.
  - A `details.maplist` "This map as a list" renders `listModel()` with the same activation buttons. It is open by default below 640px.
- [ ] **Step 4: Render the panel.**
  - `s1-panel` shows `potPanel` or `nodePanel`.
  - Amounts are `.figure` spans; source keys are resolved through `tree.sources`.
  - Show the year, share of parent, and description. When there is a `link`, add "Read more ↓". When there are `offsets`, add one line: "Also includes credits such as budgeted vacancy savings: −$X".
  - The panel gets `aria-live="polite"` only after the first user action (the v1 Sankey rule). Run `mountPopovers(panel)` after each update.
  - On load: GF selected, panel = `potPanel(gf)`.
- [ ] **Step 5: Add the Dig deeper.** The `#what` Dig deeper holds the moved Sankey. Change its intro sentence to "Where the money comes from, what rule governs it, and what it pays for".
- [ ] **Step 6: Extend `accept.mjs` and verify.** At 375 and 1200:
  - Click the Utilities pot, then assert both crumbs show one step and the header matches `/FY2026 detail/`.
  - Click GF → Police, and assert the crumb "General Fund money out › Police".
  - Press Enter on a focused leaf, and assert the panel title changes while the crumbs don't.
  - Assert `.figure:not([data-src-url])` is empty.
  - Save screenshots to `docs/screenshots/v2-s1-{375,1200,375-dark}.png`.

  Run `npm test && node scripts/accept.mjs`. Expected: `accept ok`.
- [ ] **Step 7: Commit** `feat(site): section 1 pots bar and drill-down money maps`

---

### Task 9: Section 2, why a wealthy city is short

**Files:**
- Create: `data/curated/why_short.json` (replaces the stub), `site/charts/cents-bar.js`, `site/why.js`, `site-tests/sections.test.js`
- Modify: `pipeline/build.py` (`build_why_short`), `tests/test_curated_v2.py`, `site/app.js`, `site/index.html` (lead), `site/styles.css`, `docs/data-contracts.md`

**Interfaces:**
- Produces: `why_short.json = {property_dollar: {slices: [{label, cents: Figure}], cities_cents: Figure, note}, sales_tax: {sd_rate_pct, peers: [{city, rate_pct: Figure}], measure_e: {yes_pct, no_pct, margin_votes, est_annual_m}, city_cents_of_rate}, hotel: {gf_cents, base_cents, gf_m}, trash: {moved_m, positions, fee_monthly, settlement_gf_fy2028_m}, growth: {revenue_pct, revenue_period, inflation_pct, inflation_period}, quote: {text, source}, property_tax_m, property_tax_share_pct}`. All numbers are Figures. `cents-bar.js prepare(property_dollar) -> {segments: [{label, x0, x1, cents, figure, highlight}], total}`.

- [ ] **Step 1: Write failing tests**

```python
def test_why_short_values():
    d = build_why_short(curated.load(CUR, "why_short"))
    sl = {s["label"]: s["cents"]["value"] for s in d["property_dollar"]["slices"]}
    assert abs(sum(sl.values()) - 100) <= 0.2 and d["property_dollar"]["cities_cents"]["value"] == 17.8
    assert {p["city"]: p["rate_pct"]["value"] for p in d["sales_tax"]["peers"]} == {
        "Los Angeles": 10.25, "San Jose": 10.0, "Oakland": 10.75, "San Francisco": 8.625, "Sacramento": 8.75, "San Diego": 7.75}
    me = d["sales_tax"]["measure_e"]
    assert (me["yes_pct"]["value"], me["no_pct"]["value"], me["margin_votes"]["value"], me["est_annual_m"]["value"]) == (49.69, 50.31, 3506, 400)
    assert (d["hotel"]["gf_cents"]["value"], d["hotel"]["base_cents"]["value"], d["hotel"]["gf_m"]["value"]) == (5.5, 10.5, 169.7)
    assert (d["trash"]["moved_m"]["value"], d["trash"]["positions"]["value"], d["trash"]["fee_monthly"]["value"]) == (80.8, 181, 43.60)
    assert (d["growth"]["revenue_pct"]["value"], d["growth"]["inflation_pct"]["value"]) == (3.2, 6.2)
    assert d["growth"]["revenue_period"] == "FY2028–FY2031" and d["growth"]["inflation_period"] == "FY2021–FY2025"
    assert "relatively low, while expectations of and demands for City services are not" in d["quote"]["text"]
    assert d["quote"]["source"]["page"] == 77
```

```js
// site-tests/sections.test.js
import { prepare as cents } from '../site/charts/cents-bar.js';
test('cents bar segments tile 0..100 and highlight cities', () => { /* x0 of first 0, x1 of last within 0.2 of 100, contiguous, exactly one highlight with label matching /cit/i */ });
```

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Transcribe and implement.** Transcribe `why_short.json` from `docs/research/why-deficit-2026-10.md`, including the full County Auditor slice list. Implement `build_why_short` (sum check on slices) and `cents-bar.js` `prepare` + `render`:
  - The render is one horizontal 100-cent bar; "Cities" is highlighted with `--gap`.
  - Each segment is labeled in cents where it fits; all segments are in a legend.
  - The caption says this is the countywide average for cities, not a San Diego-specific share.
- [ ] **Step 4: Build the section in `why.js` `renderWhy(el, d)`.**
  - Six short blocks (`<h3>` + 1–3 sentences with figure spans), in spec order: property tax (Prop 13, 1978), sales tax, hotel tax (Measure C, March 2020), trash, costs vs. revenue (both periods stated), and the IBA quote as a `<blockquote>` with a cite.
  - The sales-tax block includes a small sorted bar list of the 6 rates as HTML bars, not SVG, with San Diego highlighted.
  - Don't say LA's rate is a city add-on. No per-capita comparisons.
  - The Dig deeper (`s2-dig`) holds the longer detail: payments lag the market by 12–18 months; settlement detail.
  - The lead answers "a wealthy city, so why short?" in 2–4 sentences and leads with the 17.8¢.
- [ ] **Step 5: Verify.** Run `python3 -I run.py build && python3 -I -m pytest -q && npm test && node scripts/accept.mjs`. Add an `#why-short` screenshot at 375 to the accept script. Expected: all pass.
- [ ] **Step 6: Commit** `feat(site): section 2, why a wealthy city is short`

---

### Task 10: Section 3, the gap

**Files:**
- Create: `data/curated/gap_story.json`, `site/charts/waterfall.js`, `site/charts/gap-timeline.js`, `site/gapstory.js`
- Modify: `pipeline/build.py` (`build_gap_story`), `tests/test_curated_v2.py`, `site-tests/sections.test.js`, `site/app.js`, `site/index.html` (lead, `s3-debt` box copy), `site/styles.css`, `docs/data-contracts.md`

**Interfaces:**
- Produces: `gap_story.json`:

```
{headlines: {this_year: {value_m, counting: str},
             worst: {fy: 2025, value_m, without_reserve_m, counting},
             coming: {fy: 2028, city_m, iba_m, note: str, settlement: [{label, amount_m}], forecast_due: {date: "2026-11-06", source}}},
 waterfall: [{label, kind: "start"|"up"|"down"|"subtotal"|"end", amount_m, positions: Figure|null, our_arithmetic: bool}],
 adopted_note: {positions_change: Figure},
 residual: {one_time_m, one_time_uses_m, ongoing_m, skipped_reserve_m, with_reserve_m, iba_proposed_m, iba_may_m},
 definitions: [{term, plain, source}],
 timeline: [{date: "YYYY-MM", office: "IBA"|"City", doc_label, describes_fy, counts: str, value_m, value2_m: Figure|null}]}
```

  - `waterfall.js prepare(steps) -> {bars: [{label, y0, y1, kind, figure, positions, ourArithmetic}], max}`. It throws if the running total doesn't end within 0.05 of 0.
  - `gap-timeline.js prepare(timeline) -> {points: [{t, value_m, lane, ...}], years: [min, max]}`. Points are sorted by date. `lane` alternates 0/1 when two points fall within 45 days of each other.

**Waterfall (ruling: the IBA itemizes $110.9M of the $120.0M, so draw separate steps):**

| label | kind | amount | source |
|---|---|---|---|
| Gap before decisions | start | 118.0 | IBA 26-11 p.3 |
| New spending the Mayor proposed | up | 28.2 | IBA 26-11 p.4 |
| Shortfall to solve | subtotal | 146.2 | p.4 |
| Assumed savings from labor talks | down | 26.2 | p.5 |
| Left to close | subtotal | 120.0 | p.5 |
| Spending cuts (236.76 positions) | down | 66.4 | IBA 26-11 p.34, Major Budget Mitigations total $66,408,789 |
| New revenue and transfers | down | 44.5 | p.34, Revenue column total $44,462,820 |
| Other measures not itemized in the IBA's table | down | 9.1 | our arithmetic: 120.0 − 66.4 − 44.5; IBA 26-11 p.33 calls its table $110.9M and p.6 "not an exhaustive list" |
| Balanced proposed budget | end | 0 | — |

Below the chart, `adopted_note`: "Council changed some cuts in June; the adopted budget ends with 133.66 fewer General Fund positions." The figure is `headline.gf_fte_change`.

- [ ] **Step 1: Write failing tests**

```python
def test_gap_story_values():
    d = build_gap_story(curated.load(CUR, "gap_story"))
    h = d["headlines"]
    assert (h["this_year"]["value_m"]["value"], h["worst"]["value_m"]["value"], h["worst"]["without_reserve_m"]["value"]) == (118.0, 203.8, 181.4)
    assert (h["coming"]["city_m"]["value"], h["coming"]["iba_m"]["value"]) == (9.5, 32.9)
    assert [s["amount_m"]["value"] for s in h["coming"]["settlement"]] == [10.8, 9.4]
    r = d["residual"]
    assert (r["one_time_m"]["value"], r["one_time_uses_m"]["value"], r["ongoing_m"]["value"]) == (40.8, 17.7, 23.1)
    assert r["with_reserve_m"]["source"]["doc"].startswith("our arithmetic") and r["with_reserve_m"]["value"] == 103.2
    assert (r["iba_proposed_m"]["value"], r["iba_may_m"]["value"]) == (91.3, 95.4)
    vals = sorted(e["value_m"]["value"] for e in d["timeline"])
    assert vals == sorted([258.2, 88.8, 118.0, 11.2, 15.3, 23.1, 32.9, 9.5])
    assert sorted(e["value2_m"]["value"] for e in d["timeline"] if e["value2_m"]) == [91.3, 95.4]
    assert [x["term"] for x in d["definitions"]] == ["Forecast gap", "Structural deficit", "Balanced budget"]

def test_gap_story_rejects_unbalanced_waterfall(): ...  # bump one step, expect ValueError naming "waterfall"
```

```js
test('waterfall runs 118 → 146.2 → 120 → 0 and flags our arithmetic', () => { /* subtotal y1 values [146.2, 120.0], last bar y1 0 within 0.05, exactly one ourArithmetic */ });
test('waterfall prepare throws when steps do not close', () => { /* assert.throws */ });
test('timeline sorts by date and separates near points into lanes', () => { /* Apr 2026 118.0 and Apr 2026 11.2 get different lanes */ });
test('calculator second state is our arithmetic about $103M', () => { /* compute(gap,'post_cut')[1] approx true */ });
```

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Transcribe and validate.** Transcribe `gap_story.json` from `docs/research/gap-numbers-2026-10.md` §1–3 and the waterfall table above. `build_gap_story` checks:
  - `with_reserve_m == ongoing_m + skipped_reserve_m` (to 0.05);
  - `one_time_m − one_time_uses_m == ongoing_m`;
  - the waterfall closes;
  - every Figure is valid.
  
  The `coming` note reads: "The two were measured at different stages. The city's documents don't say whether its $9.5M includes the settlement costs. A new forecast is due November 6, 2026."
- [ ] **Step 4: Render** (`gapstory.js` + chart modules):
  - **Headlines:** three cards in a row that stack at 375px, each with a question, big number(s) and a one-line "what it counts". "What's coming?" shows $9.5M (city) and $32.9M (IBA) side by side at equal size, with no ranking; settlement costs are listed under them, then the note.
  - **Waterfall:** a vertical-bar step chart. Down-steps use `--discretionary`, the up-step uses `--gap`, and the start and subtotals use `--locked`. Each bar has a value label. The our-arithmetic step is hatched, with "(our arithmetic)" in its label.
  - **Residual:** prose in `s3-residual` with figure spans. Its ~$103M is labeled "our arithmetic", and the IBA's $91.3M / $95.4M are in the Dig deeper.
  - **`s3-debt` box:** static copy from the spec's "Is this debt?" paragraph, with three links: `#reserves`, `#infrastructure`, `#pension`.
  - **Dig deeper:** the definitions as a `<dl>`, then the timeline (dots on a date axis with the value labeled and a tap/focus tooltip showing office, document, FY and what it counts), then the moved funnel and cuts tables.
  - **Section lead:** 2–4 sentences.
- [ ] **Step 5: Verify.** Run `python3 -I run.py build && python3 -I -m pytest -q && npm test && node scripts/accept.mjs`, adding `#gap` 375 light and dark screenshots. Expected: all pass.
- [ ] **Step 6: Commit** `feat(site): section 3, the gap and how it was closed`

---

### Task 11: Section 4, what piles up

**Files:**
- Create: `data/curated/piles_up.json`, `site/charts/piles.js`, `site/piles.js`
- Modify: `pipeline/build.py` (`build_piles_up`), `tests/test_curated_v2.py`, `site-tests/sections.test.js`, `site/app.js`, `site/index.html`, `site/styles.css`, `docs/data-contracts.md`

**Interfaces:**
- Produces: `piles_up.json`:

```
{reserves: {balance_m, target_m, goal_pct, goal_fy, draw_m, skipped_m, years_to_goal, unaudited: true},
 infrastructure: {gap_m, needs_m, funding_m, prior_gap_m, by_asset: [{asset, gap_m}],
                  roads: {pci_2016, pci_2023, poor_share_text, funding_share_pct, goal_old, goal_new, pci_2036},
                  examples: [{name, note, source}], process: [{step, text, source}]},
 pension: {liability_m, assets_m, shortfall_m, funded_pct, valuation_date: "2025-06-30",
           adc_total_m, payers: [{label, amount_m}] × 5, rise_m, fy2028_m, fy2029_m, full_funding_valuation: "2041-06-30"}}
```

  - `charts/piles.js`:
    - `prepareReserve(r) -> {fill: balance/target, segments}`;
    - `prepareAssets(by_asset, n = 8) -> rows`: the top `n` sorted descending, plus "Everything else", summing to `gap_m` within 1;
    - `preparePension(p) -> {bars: [promised, held], shortfall, payers: rows with share}`.

- [ ] **Step 1: Write failing tests**

```python
def test_piles_up_values():
    d = build_piles_up(curated.load(CUR, "piles_up"))
    r = d["reserves"]
    assert (r["balance_m"]["value"], r["target_m"]["value"], r["goal_pct"]["value"], r["draw_m"]["value"]) == (202.4, 262.9, 16.7, 4.7)
    i = d["infrastructure"]
    assert (round(i["gap_m"]["value"]), round(i["needs_m"]["value"]), round(i["funding_m"]["value"])) == (7815, 12825, 5010)
    a = {x["asset"]: round(x["gap_m"]["value"]) for x in i["by_asset"]}
    assert a["Stormwater"] == 5085 and a["Sidewalks"] == 253
    assert abs(sum(x["gap_m"]["value"] for x in i["by_asset"]) - i["gap_m"]["value"]) <= 1
    rd = i["roads"]; assert (rd["pci_2016"]["value"], rd["pci_2023"]["value"], rd["goal_new"]["value"], rd["pci_2036"]["value"]) == (71, 63, 65, 52)
    p = d["pension"]
    assert {x["label"]: x["amount_m"]["value"] for x in p["payers"]} == {
        "General Fund": 396.300918, "Utilities": 106.011172, "Money tied to a purpose": 47.210165,
        "Internal services": 10.771424, "Other": 2.905442}
    assert abs(sum(x["amount_m"]["value"] for x in p["payers"]) - 563.199121) < 1e-6
    assert all(x["amount_m"]["source"]["page"] == 30 for x in p["payers"])
    assert (p["funded_pct"]["value"], p["rise_m"]["value"], p["fy2028_m"]["value"], p["fy2029_m"]["value"]) == (76.1, 26.4, 573.2, 493.4)
```

```js
test('assets: top 8 plus everything else, sums to gap', () => { ... });
test('pension: GF share is 70%', () => { /* Math.round(share*100) === 70 */ });
test('reserve fill below 1 and goal marked', () => { ... });
```

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Transcribe and validate.** Transcribe from `docs/research/pension-reserves-2026-10.md` and `docs/research/infrastructure-2026-10.md` (`by_asset` = the full FY27–31 asset table). Follow the research file's conflict rules: Vol. III over Vol. I for CIP shares; never mix the $8.21B measure; Fire Station 51 and San Carlos library are not funded. `build_piles_up` checks the asset sum, the payer sum, and `shortfall_m ≈ liability_m − assets_m` (to 1).
- [ ] **Step 4: Render** three sub-sections (`#reserves`, `#infrastructure`, `#pension`), each with an `<h3>`, a one-number lead, a visual and a Dig deeper:
  - **Reserves:** a horizontal meter for balance vs. target, with the target labeled. Copy: the 16.7%-by-FY2030 goal, the $4.7M draw (first in recent history, late storm reimbursements), the skipped $80.1M, and "about 15 years" (IBA). The headline is labeled "unaudited".
  - **Infrastructure:** "$7.82B" with one sentence: it grew about $1.3B in a year (our arithmetic, 7.82 − 6.51), mostly stormwater. Then horizontal bars by asset type, plus the sentence that water and sewer count as fully funded by their rates. A roads sub-block gives the PCI figures as a 4-point mini line (2016, 2023, goal, 2036 projected) with the projection dashed. The Dig deeper has the named examples, what is funded (link to `#what`, the Construction projects pot), and the selection process (Council Policy 800-14, 100-point scoring, competing only within funding source, committees → Mayor in April → Council in June).
  - **Pension:** two bars ($14.51B promised, $11.05B held) with the $3.46B gap marked and "76 cents saved for every dollar promised". Then a stacked bar of the $563.2M payment by payer, with GF at 70% and the copy "the budget assigns" (Table 8). Then copy on the rise, the scheduled relief (FY2028 $573.2M → FY2029 $493.4M) and 100% funded around 2041.
- [ ] **Step 5: Verify.** Run `python3 -I run.py build && python3 -I -m pytest -q && npm test && node scripts/accept.mjs`, adding `#piles` 375 light and dark screenshots. Expected: all pass, and total `data/build` under 300,000 bytes.
- [ ] **Step 6: Commit** `feat(site): section 4, reserves, infrastructure backlog, pension`

---

### Task 12: Sections 5–6 touch-ups, sources, methods, final acceptance

**Files:**
- Modify: `data/curated/claims.json` (bike card link), `site/claims.js`, `site/index.html`, `site/sources.js` (if new files need collecting), `README.md`, `docs/data-contracts.md`, `scripts/accept.mjs`, `docs/screenshots/`

- [ ] **Step 1: Write the failing test.** In `tests/test_build.py`, the bike-lanes card has `link: "#infrastructure"`, and `site-tests` asserts that `claimCardModel` exposes it.
- [ ] **Step 2: Implement the touch-ups.**
  - The bike card renders "How projects are chosen ↓".
  - The `#how-long` chart shows the FY2028 two-figure marker (Task 1). Its lead is already rewritten (Task 7).
  - Add a "How we built this" note in `#what`'s Dig deeper. It says:
    - which levels are FY2027 and which are FY2026;
    - the category rule (from `categories.py`'s docstring);
    - the unassigned spending shown in the Internal services & other map (`unassigned`), and the rows we could not draw at all (`unmatched`), with amounts;
    - that "our arithmetic" marks our own sums.
- [ ] **Step 3: Collect the new sources.** Make sure `renderSources` collects every Source used by the new files: `budget_tree.sources`, `why_short`, `gap_story`, `piles_up`.
- [ ] **Step 4: Write the full acceptance checks.** `node scripts/accept.mjs` at 375 and 1200, in light and dark:
  - no page errors;
  - no horizontal scroll;
  - `.figure:not([data-src-url])` count 0, and every `[data-src-url]` has a `.fn` button;
  - no visible text "$103.2M", "~$30M", "6.51B" except inside the "our arithmetic" growth sentence, and no "396.1";
  - every `a[href^="#"]` target exists.
  
  Refresh `docs/screenshots/v2-*.png` and delete the v1 `task*.png` and `final-*.png` screenshots the README no longer references.
- [ ] **Step 5: Update the docs.** README: new page order, new curated files, the `accept.mjs` usage. `docs/data-contracts.md` covers every new built file.
- [ ] **Step 6: Verify everything.** Run `python3 -I run.py build && python3 -I -m pytest -q && npm test && node scripts/accept.mjs`. Expected: `build ok`, all pass, `accept ok`.
- [ ] **Step 7: Commit** `chore: v2 acceptance, sources, methods note, screenshots`

---

## Rulings made while writing this plan

- **Waterfall itemization (spec left it to the builder):** IBA 26-11 pp.33–34's Major Budget Mitigations table itemizes $66.4M of cuts and $44.5M of revenue. Its own text gives the total as $110.9M. The remaining $9.1M is one step labeled "our arithmetic". Cost if wrong: one bar mislabeled.
- **Categories:** the spec's seven example categories grow to 13, with "Other costs" as the catch-all. Utilities and purpose-restricted funds are dominated by contracts, supplies and transfers, which "Everything else" would hide. Cost if wrong: copy churn in `labels.json`.
- **Descriptions required** for level-1 items in the GF maps and the Utilities and Money-tied-to-a-purpose spending maps (~38), matching the spec's "roughly 30–40". Others fall back to their category's text.
- **Mount ids kept** when chapters move; section ids are new.
- **`post_cut_iba_m` renamed** to `post_cut_with_reserve_m`, because the old name claimed an IBA figure that is our arithmetic.
