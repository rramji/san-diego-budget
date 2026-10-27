# San Diego Budget Explainer v2: Design

Date: 2026-10-27
Owner: Robert Ramji
Status: approved by Robert 2026-10-27
Builds on: `docs/superpowers/specs/2026-10-23-sd-budget-explainer-design.md`
(v1). Everything in v1 still holds unless this document changes it. In
particular v1's audience, anti-goals, constraints, sourcing rule, tone,
and architecture carry over unchanged.

Robert's calls are marked R; mine are marked B.

## Why a v2

Robert read the v1 page and found that opening on the budget gap was
confusing: a reader has to know what the budget *is* before a shortfall
in it means anything. He also found the research behind v1 more
interesting than the page let on (the infrastructure backlog, the
pension, the reserves, why a wealthy city is short of money), and the
many different gap numbers (projected, real, residual, peak) confusing
rather than illuminating. (R)

His own starting point is typical of the audience: roads aren't in great
shape, and the city has a deficit, which is surprising for a place with
high property values, a high cost of living, and lots of tourists. (R)

v2 therefore:

1. Opens with a basic, explorable picture of what the budget is made of
   and where its money comes from. (R)
2. Folds in all the October 2026 research. (R)
3. Gives each question one headline number and puts the other numbers
   in a reconciliation the reader can open if they want it. (R asked for
   a "simplified summary view"; the one-number-per-question shape is B.)
4. Lets every summary invite further exploration: click to open more
   and more detailed breakdowns and descriptions. (R)

## Goals (in addition to v1's)

- A reader who only looks at the first section leaves knowing roughly
  how big the budget is, that most of it is walled off by law, and what
  the General Fund spends on and lives on.
- A reader who explores can drill from any pot of money down to the
  lines inside it, with a plain explanation at every level.
- Each later section answers one question a newcomer would actually ask,
  with one number first.
- The numbers that used to collide (the many gaps) appear in one place
  as a timeline, each labeled with who measured it, when, and what it
  counts.

## Anti-goals (in addition to v1's)

- A headline that combines figures from different documents or stages
  without saying so. Any sum we compute ourselves is labeled "our
  arithmetic" on screen.
- Making the reader choose between gap numbers before telling them what
  each one measures.
- A drill-down that hides how to go back.

## Page order (R approved, 2026-10-27)

One scrolling page, six sections. Each opens with a plain question as
its heading, a two-to-four sentence lead, one primary visual, and a
collapsed "Dig deeper". The v1 progress indicator, popovers, glossary
and sources list carry over and cover the new sections.

1. What is the city budget, and where does the money come from?
2. Why doesn't a wealthy city have more money?
3. The gap: how big is it, and how was it closed?
4. What piles up: reserves, infrastructure, pension.
5. How long has this been going on?
6. Check a claim.

Sections 2 and 4 are B's proposal from the research; R approved the
outline as a whole.

---

## Section 1: What is the city budget? (R)

### Primary visual: pots bar plus twin drill-down maps (R chose this
shape from the v2 mockup, 2026-10-27)

**The pots bar.** One horizontal bar, full width, splitting the FY2027
adopted citywide budget ($6,486.9M) into five pots with plain labels:

| Pot label (plain) | Fund types | FY2027 | Source |
|---|---|---|---|
| General Fund | General Fund | $2,256.7M | Vol. I Exec Summary |
| Utilities | Enterprise Funds | $1,915.1M | Vol. I Exec Summary |
| Money tied to a purpose | Special Revenue Funds | $1,207.9M | Vol. I Exec Summary |
| Construction projects | CIP | $858.1M | Vol. I Exec Summary |
| Internal services & other | Internal Service ($225.7M) + Capital Project Funds ($23.5M) | $249.2M | Vol. I Exec Summary |

These five already exist in `data/build/headline.json`. The General Fund
is selected on load. Clicking a pot selects it.

**Twin maps.** Below the bar, two treemaps side by side: "Money in" and
"Money out" for the selected pot. On screens narrower than about 640px
they stack, money in first. Rectangles are sized by dollars and labeled
with name and amount where they fit.

**Drill-down.** (R: "be able to click and explore to open up more and
more detailed breakdowns/descriptions"; R rejected the v1 mockup's
click-to-zoom/click-to-go-back as unintuitive.)

- A rectangle that has children shows a ⊕ mark. One click on it opens
  it: the map redraws showing its children, and the details panel
  explains it. A rectangle without children just shows its details.
- Above each map, a path shows where you are ("General Fund money in ›
  Everything else › Other local taxes"). Every step except the current
  one is a link back up. This is the only way back; there is no hidden
  "click again to go up".
- The two maps drill independently.
- Selecting a different pot resets both maps to that pot's top level.

**Details panel.** One panel below both maps, updated on every click.
For a pot, it answers four questions (B, from R's "makeup and
commitments", 2026-10-27):

1. What it is, in plain words.
2. Where its money comes from.
3. What it's committed to: the legal rule on what it can pay for, debts
   it is paying off, and costs it can't skip.
4. Who decides how it's spent.

For a rectangle inside a pot, the panel gives name, amount, share of its
parent, a one-to-three sentence plain description, the year of the
figure, a footnote popover to its source, and (where one exists) a link
to the section of the page that discusses it (e.g. Property tax →
section 2; Stormwater → section 4's infrastructure part; Pension payment
→ section 4's pension part).

**Accessibility.** Rectangles and path links are keyboard-focusable and
operable with Enter/Space; the panel is a polite live region that does
not re-announce on load (v1's Sankey lesson). Each map has a visually
hidden or toggleable list equivalent (name, amount, opens-further) so
the content is available without the picture.

### Which year at which level (B, Robert did not object, 2026-10-27)

- Pots bar and the top level of the General Fund's two maps: FY2027
  adopted, from the PDFs.
  - GF money out top level: the nine department slices already in
    `data/build/funnel.json` bar 4.
  - GF money in top level: transcribe the full FY2027 category table
    (Vol. I General Fund Revenues, Table 2) instead of a lump "other".
    Known values: property tax $881.0M (p.66), sales tax $386.7M,
    hotel tax General Fund share $169.7M (p.69–70).
- Everything deeper, and the top level of the other four pots: FY2026
  adopted, from the operating budget CSV (latest line-item data), except
  Construction projects (below). Each figure is labeled with its year in
  the panel, and the map header says "FY2026 detail" when the map is
  showing FY2026 data.
- Construction projects: FY2027 from the research (Vol. III), money in
  by funding source, money out by department or asset type, with the
  largest named projects as the next level. See
  `docs/research/infrastructure-2026-10.md` Q4.
- When the city publishes FY2027 rows in the operating budget CSV,
  re-running the pipeline switches the CSV-derived levels to FY2027
  with no code change (the pipeline picks the latest FY present).

Because money in and money out come from different documents and
sometimes years, the two maps of one pot need not total the same. A
fund can also take in more or less than it spends in a year (it saves
for construction, or draws down a balance). The panel says so in one
sentence when the totals differ by more than 1%.

**Bar year vs. map year (B, after builder check).** For Utilities, Money
tied to a purpose, and Internal services, the bar shows FY2027 but the
maps show FY2026 detail, and the FY2026 totals are smaller (Utilities
$1,702M in the CSV vs. $1,915.1M on the bar; Money tied to a purpose
about $1.0B vs. $1,207.9M). The bar keeps FY2027. When one of those pots
is selected, each map's header states its own year and total ("FY2026
detail: $1.70B"), and the panel says in one sentence that the detail is
from last year's budget because this year's line-by-line data isn't
published yet. The `checks.py` 1% rule compares a map's children with
that map's own stated total (the CSV FY2026 fund-type total), not with
the FY2027 bar. No FY2026 or FY2027 fund-level transcription is needed.

### What the hierarchy contains (B)

From the FY2026 CSV (sizes verified 2026-10-27):

- **General Fund, money out:** department → about seven plain
  categories (Salaries, Pension payment, Overtime, Health & flexible
  benefits, Workers' comp, Vehicles, Everything else). E.g. Police
  FY2026: salaries $301.8M, pension $161.2M (three CERS lines),
  overtime $45.3M.
- **General Fund, money in:** category → top accounts. E.g. Other local
  taxes → SDG&E franchise $66.3M, trash hauler franchise $14.2M,
  property transfer tax $11.6M, cable franchise $9.1M.
- **Utilities, money out:** fund (Water $820.2M, two sewer funds
  $471.1M, Development Services $150.0M, Solid Waste $139.9M, Refuse
  Disposal $55.8M, Golf $30.9M, Recycling $24.3M, Airports $10.2M) →
  the same plain categories.
- **Utilities, money in:** revenue type (charges for services $1,361.1M
  dominates) → top accounts.
- **Money tied to a purpose, money out:** the top ~10 of 102 funds by
  size plus "everything else", each fund → plain categories. Top funds:
  Engineering & Capital Projects $179.1M, Transient Occupancy Tax Fund
  $158.2M, Fire/EMS Transport $136.8M, IT $85.9M, Underground Surcharge
  $80.1M, Gas Tax $39.3M, Road Maintenance & Rehabilitation (state SB1)
  $36.3M.
- **Internal services, money out:** fund (Fleet Replacement $122.7M,
  Fleet Operations $70.5M, Risk Management Admin $20.2M, …).

A curated label map (`data/curated/labels.json`) turns CSV names into
plain English ("CERS - Saf Ret - Police" → "Pension payment").

How much copy (B, after builder check):
- The five pots get the four panel answers, cited.
- Each named fund, department and revenue category shown (roughly 30–40
  items) gets a one-to-two sentence cited description. No per-fund
  four-answer treatment and no per-fund debt research.
- Plain categories (Salaries, Pension payment, …) get one shared
  description each; any account or line below a category uses its
  category's description plus its own name and amount. No per-account
  copy. The account-to-category grouping is a documented rule in
the pipeline, unit-tested, and listed in the methods note. Pot and fund
descriptions are written from the budget documents and cited; Robert
reviews the copy.

Depth: at most three levels below a pot. Each level shows at most ~10
rectangles; the rest roll into "Everything else", which itself opens.

### Dig deeper

The v1 Sankey (source → rule → use) moves here from v1 chapter 2, since
it answers "where does the money come from and what rules govern it".
Its FY2027 GF pension figure updates to $396.3M (see corrections).

---

## Section 2: Why doesn't a wealthy city have more money? (B; R
approved outline)

Lead answers Robert's own surprise directly. Headline number (B): the
city gets about 18 cents of each dollar of the basic 1% property tax,
stated carefully as the *countywide average for cities*, since a
San Diego-specific share was not found.

Primary visual (builder's form, B's suggestion): "where your
property-tax dollar goes", one 100-cent bar from the County Auditor's
chart (schools 44.7¢, county 20.9¢, cities 17.8¢, …).

Content, each a short block with its own number and source, opening to
detail in Dig deeper:

- Property tax: Prop 13 (1978) caps the rate at 1% and taxable value
  growth at 2% a year until sale; payments lag the market 12–18 months.
  FY2027 GF property tax $881.0M, 39% of GF revenue.
- Sales tax: the city gets 1 cent of 7.75%. Peer rates (CDTFA,
  Oct 1, 2026): Los Angeles 10.25%, San Jose 10.0%, Oakland 10.75%,
  San Francisco 8.625%, Sacramento 8.75%. Do not say LA's rate is a city
  add-on (it equals the county rate). Measure E (Nov 2024, +1 cent)
  failed 49.69% to 50.31%, a margin of 3,506 votes; the city estimated
  about $400M a year.
- Hotel tax: of the 10.5-cent base rate, 5.5 cents ($169.7M) go to the
  General Fund; most of the rest is set aside for promotion. Measure C
  (March 2020; collected from May 2025) is restricted to the Convention
  Center and homelessness.
- Trash: free for single-family homes from 1919 (People's Ordinance)
  until a fee adopted June 2025, which moved $80.8M and 181 positions
  off the General Fund in FY2026. A settlement the Council approved
  June 8, 2026 lowers the fee from July 2027 and brings back some GF
  subsidy (IBA: about $10.8M in FY2028).
- Costs: IBA projects revenue growth averaging about 3.2% a year
  (FY2028–31) against 6.2% actual inflation over FY2021–25. Say both
  periods; they differ.
- The IBA's own summary line, quoted: the city's major General Fund
  revenues, "in comparison to other peer cities, are relatively low,
  while expectations of and demands for City services are not" (IBA
  26-11 p.77).

No per-capita peer comparison: none was found from a credible current
source, and we do not compute one from mismatched sources.

All figures and pages: `docs/research/why-deficit-2026-10.md`.

---

## Section 3: The gap (B; R approved outline)

Replaces v1 chapter 3 and absorbs the gap-related parts of v1
chapter 2.

### Three questions, one number each (B)

| Question | Headline | Counting stated on screen | Source |
|---|---|---|---|
| How big was it this year? | $118M | FY2027 shortfall before the budget's decisions; already assumes no reserve deposits | IBA 26-11 p.3 |
| How bad did it get? | $203.8M | FY2025 adopted budget, counting $22.4M of skipped reserve deposits as one-time money ($181.4M without them) | IBA 26-11 p.78 |
| What's coming? | $9.5M to $32.9M | FY2028. Two measurements, shown side by side, neither ranked: the city budget office's updated outlook after the adopted budget ($9.5M; Vol. I Citywide Budget Overview p.36, Table 10) and the IBA's estimate made at the proposed-budget stage ($32.9M, excluding reserve deposits; IBA 26-15 p.43). Below them, the separately listed settlement costs (~$10.8M trash subsidy, $9.4M lost parking revenue; IBA 26-15 pp.44–45), not added to either, with a note that it isn't stated whether the city's $9.5M includes them. A new forecast is due Nov 6, 2026 (IBA 26-20) | as listed |

(B, after builder check.) This is v1's "show both framings" rule winning
over the one-number-per-question shape: when the city and the IBA
disagree, the headline is the pair. The two differ partly because they
were measured at different stages; the copy says so.

The "What's coming" figures must be easy to update when the Nov 6
forecast lands: keep them in curated data, not in copy. Ship with what
exists and update afterwards; do not wait for Nov 6. (B)

### How this year's gap was closed (B)

A step chart (waterfall) from $118M to a balanced budget:

$118.0M gap → + $28.2M proposed additions = $146.2M → − $26.2M assumed
labor savings = $120.0M to close with cuts and new revenue → major cuts
$66.4M and 236.76 positions in the proposed budget (library and rec
center hours, arts grants, shelter beds, …) → the remainder from new
revenue and one-time money. (IBA 26-11 pp.3–6.)

The builder must find the itemization of the remaining ~$53.6M in IBA
26-11 or the Exec Summary before drawing it as separate steps. If it is
not itemized, draw one honest "other revenue and one-time measures" step
and label it. Below the chart, one sentence: Council changed some cuts in
June; the adopted budget ends with 133.66 fewer GF positions (Exec
Summary).

Then the residual, in plain words: the adopted budget uses $40.8M of
one-time money, $17.7M of it for one-time things; the other $23.1M pays
for ongoing costs, so it is still a hole next year (Exec Summary p.5).
If the reader also counts the skipped $80.1M reserve deposit, as the IBA
did at earlier stages, it is about $103M: labeled **our arithmetic**
(23.1 + 80.1), with the IBA's own published equivalents in Dig deeper
($91.3M at the proposed budget, IBA 26-11 p.78; $95.4M at the May
Revision, IBA 26-15 p.43).

### "Is this debt?" (B)

A short box, answering Robert's question for every reader: a structural
deficit is not money owed; it is ongoing spending paid for with money
that won't come back, like paying rent from savings. What does pile up:
reserves fall behind, maintenance gets deferred, and capital borrowing
(not deficit borrowing) adds debt payments. Each points to section 4.

### Per-person cost

The v1 calculator (per resident, per household, sales-tax increment,
flat monthly fee) carries over unchanged in behavior. Its toggle's
second state changes from the unsourced "$103.2M (IBA-consistent)" to
the city's $23.1M and the labeled our-arithmetic ~$103M above.

### Dig deeper: "Why there are so many gap numbers"

The timeline Robert asked for: every gap figure on one horizontal
timeline, each a dot with date, office, document, which fiscal year it
describes, and what it counts. Minimum set: $258.2M (Dec 2024, FY2026
forecast), $88.8M (Nov 2025, FY2027 baseline), $118.0M (Apr 2026),
$11.2M / $91.3M (Apr 2026, proposed budget), $15.3M / $95.4M (Jun 2026,
May Revision), $23.1M (adopted), $32.9M (IBA FY2028 estimate),
$9.5M (city's updated FY2028 outlook, Vol. I CBO p.36). Above it, the
three plain definitions: forecast gap, structural deficit, and what
"balanced" legally means (Charter §69). Source:
`docs/research/gap-numbers-2026-10.md` §1–3.

The v1 funnel (what can actually be cut) and the cuts tables also move
to this Dig deeper.

---

## Section 4: What piles up (B; R approved outline)

Three parts, each with its own small heading, one number, one visual,
and a Dig deeper. Figures and pages: `docs/research/pension-reserves-2026-10.md`
and `docs/research/infrastructure-2026-10.md`.

### 4a. The rainy-day reserve

Headline: $202.4M at the end of FY2026, against a target of $262.9M
(unaudited). Visual: a single meter, balance vs. target, with the policy
goal of 16.7% of revenue by FY2030 marked. Copy: the $4.7M draw in
FY2026, mainly late state storm reimbursements, the first in recent
history (IBA 26-25 p.12); the $80.1M skipped FY2027 deposit; the IBA's
estimate of about 15 years to reach 16.7% at 1% of revenue a year.

### 4b. The infrastructure backlog

Headline: **$7.82B** unfunded over FY2027–31 (needs $12.82B, expected
funding $5.01B; FY2027–2031 CIP Outlook Table 23 p.35, IBA 26-06). This
replaces v1's $6.51B, which was the previous year's Outlook. Say once
that it grew $1.3B in a year, mostly stormwater.

Visual: unfunded need by asset type (stormwater $5.09B, street paving
$678M, streetlights $467M, fire stations $310M, sidewalks $253M, police
stations $222M, parks $221M, …). Copy: water and sewer are treated as
fully funded by their rates, so the whole gap falls on General Fund
assets.

Roads, because the audience arrives thinking about them: Pavement
Condition Index 71 (2016) → 63 "fair" (2023); about a third of streets
"poor" or worse; FY2026 paving money about 32% of the plan's need; goal
lowered from 70 to 65; projected 52 "poor" by FY2036 on current funding.

Dig deeper: named unfunded examples (pump stations, Fire-Rescue training
center, Ocean Beach Pier, Fire Station 54, flood channels); what *is*
funded (FY2027 CIP $858.1M, ~69% water and sewer, largest projects); how
projects are chosen (Council Policy 800-14 scoring out of 100, competing
only within their funding source; staff committees → Mayor in April →
Council in June). That last point links to the bike-lane claim card.

Handle the known source conflicts as the research file says: use Vol.
III over Vol. I p.167 for CIP department shares; do not mix the $8.21B
"unidentified funding" measure with the Outlook gap; don't call Fire
Station 51 or San Carlos library funded.

### 4c. The pension

Headline: 76 cents saved for every dollar promised (76.1% funded): the
city has promised $14.51B in benefits earned so far and the fund holds
$11.05B, a $3.46B shortfall (June 30, 2025 valuation).

Visual: promised vs. held, as two bars or one bar with the shortfall
marked. Then the yearly payment: $563.2M citywide this year, split by
who pays (General Fund $396.3M, utilities $106.0M, purpose-restricted
funds $47.2M, internal service funds $10.8M, other $2.9M; total
$563,199,121; Vol. I Citywide Budget Overview Table 8, printed p.30).
Exact Table 8 Retirement ADC row: General Fund $396,300,918; Special
Revenue $47,210,165; Enterprise $106,011,172; Internal Service
$10,771,424; Other $2,905,442. Copy: each fund pays for its own employees' pensions, so the
General Fund, which employs most city workers, pays 70%. (State this as
"the budget assigns", from Table 8; the allocation formula itself is
not stated in the documents read.)

Copy: why it rose this year (pay raises above the actuary's assumption,
+$26.4M); scheduled relief (projected $573.2M in FY2028 then $493.4M in
FY2029 as old layers are paid off); actuary's baseline reaches 100% at
the June 30, 2041 valuation.

---

## Section 5: How long has this been going on? (v1 chapter 1, moved)

Unchanged except: the FY2028 marker shows the same pair as section 3
($9.5M city, $32.9M IBA) instead of KPBS's ~$30M, and the lead is rewritten so it no longer
assumes it is the first thing the reader sees.

## Section 6: Check a claim (v1 chapter 4, moved)

Unchanged except the corrections below. The bike-lane card gains a link
to section 4b's "how projects are chosen".

---

## Corrections to v1 data (apply regardless of layout)

| What | v1 | v2 | Source |
|---|---|---|---|
| GF pension payment FY2027 | $396.1M (proposed) | $396.3M (adopted) | Vol. I pp.30, 85 |
| Post-cut gap, IBA framing | "$103.2M IBA-consistent" | "~$103M, our arithmetic" + IBA's $91.3M / $95.4M | IBA 26-11 p.78; 26-15 p.43 |
| FY2028 marker | ~$30M (KPBS) | $9.5M (city) and $32.9M (IBA) | Vol. I CBO p.36; IBA 26-15 p.43 |
| Unfunded infrastructure | $6.51B | $7.82B | FY27–31 CIP Outlook p.35 |
| Trash settlement | "tentatively approved" | approved by Council June 8, 2026 | why-deficit research Q5 |

Where 17.7% (pension share of GF) appears, keep it but label it as the
proposed-budget figure (IBA 26-11 p.75); no adopted-basis share is
published.

Errors the research found in sources, to avoid repeating: Prop 13 is
1978 (the FY2027 budget says 1979); Measure C is 2020; IBA 25-36 p.10's
"$347.1M" FY2026 sales tax is a typo for $374.1M; the trash fee is
$43.60/month (city), not $42.76; IBA 26-11 p.3's $203.7M vs. its table's
$203.8M (use the table).

## Data and code (B)

- New curated files (each number a Figure `{value, source}` as in v1):
  `labels.json` (plain labels, descriptions, four panel answers per pot
  and fund), `gf_revenue_fy2027.json` (Table 2), `cip_fy2027.json`,
  `why_short.json`, `gap_story.json` (three headlines, waterfall steps,
  timeline), `piles_up.json` (reserves, infrastructure, pension).
- New build output: a budget tree JSON for section 1, generated from the
  CSV plus curated FY2027 top levels, trimmed to the depth and breadth
  rules above. The whole `data/build/` stays under v1's 300KB budget;
  `checks.py` enforces it and adds checks that each pot's top-level
  children sum to the pot within 1%.
- New chart module `site/charts/budget-map.js` with the v1 split: a
  pure `prepare()` (tested with `node --test`) and a D3 `render()`.
- Research notes are committed under `docs/research/*-2026-10.md`.
- Work continues on the `explainer` branch (not yet merged to
  `master`).

## Left to the builder

- The exact visual form of sections 2 and 4's primary visuals, within
  the constraints (phone width, light/dark, every figure sourced, no
  dual axes).
- Treemap layout algorithm, colors, label fitting, animation (must
  degrade without it).
- Which accounts map to which plain category, as long as the rule is
  documented and tested.
- Draft panel and lead copy, for Robert to review.
- Whether section 3's waterfall can itemize beyond "other revenue and
  one-time measures" (depends on what IBA 26-11 itemizes).
