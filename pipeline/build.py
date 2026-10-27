"""Assemble the published JSON files in data/build/ from raw CSVs and curated figures."""
import copy
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

from pipeline import curated
from pipeline.bike_match import is_bike_project, is_road_repair
from pipeline.budget_tree import build_budget_tree
from pipeline.csv_loader import (
    gf_by_dept,
    gf_totals_by_fy,
    load_budget_rows,
    load_cip_rows,
    load_fund_names,
    select_cycle,
    unmatched_rows,
)


def _round(obj):
    if isinstance(obj, float):
        return round(obj, 3)
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_round(v) for v in obj]
    return obj


def _write(out_dir: Path, name: str, data) -> Path:
    path = Path(out_dir) / f"{name}.json"
    path.write_text(
        json.dumps(_round(data), indent=None, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return path


def _vintage(raw_dir: Path) -> dict:
    path = Path(raw_dir) / "manifest.json"
    if not path.exists():
        return {"fetched_at": None, "sha256": {}}
    manifest = json.loads(path.read_text(encoding="utf-8"))
    return {
        "fetched_at": max((m["fetched_at"] for m in manifest.values()), default=None),
        "sha256": {name: m["sha256"] for name, m in manifest.items()},
    }


def build_series(rows: list[dict], vintage: dict | None = None) -> dict:
    rows = select_cycle(rows)
    totals = gf_totals_by_fy(rows)
    fys = sorted({r["fy"] for r in rows})
    return {
        "gf_by_fy": {str(fy): totals[fy] for fy in fys if fy in totals},
        "gf_dept_by_fy": {
            str(fy): [[dept, amt] for dept, amt in gf_by_dept(rows, fy)] for fy in fys
        },
        "vintage": vintage or {"fetched_at": None, "sha256": {}},
    }


DEFICIT_CONVENTION = "positive = size of General Fund structural gap, $ millions"
_IBA_26_11 = "https://www.sandiego.gov/sites/default/files/2026-04/iba-report-26-11-review-of-the-fiscal-year-2027-proposed-budget_0.pdf"
_CBO_FY27 = "https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1cbo.pdf"
_IBA_26_15 = "https://www.sandiego.gov/sites/default/files/2026-05/26-15-recommended-city-council-modifications-to-the-mayors-proposed-fy-2027-budget-and-review-of-the-may-revision.pdf"
DEFICIT_MARKERS = [
    {"fy": 2011, "label": "2010: temporary sales tax measure fails", "source": {"source": {
        "doc": "IBA Report 26-11, Key Citywide Issues: Structural Budget Deficit (2010 temporary five-year sales tax measure failed to pass)",
        "page": 77, "url": _IBA_26_11}}},
    {"fy": 2025, "label": "2024: sales tax measure fails", "source": {"source": {
        "doc": "IBA Report 26-11, Key Citywide Issues: Structural Budget Deficit (2024 sales tax measure failed to pass)",
        "page": 77, "url": _IBA_26_11}}},
    {"fy": 2026, "label": "Trash fee adopted with FY2026 budget", "source": {"source": {
        "doc": "IBA Report 26-11, Overview (FY 2026 adoption of a trash fee; footnote 4)",
        "page": 3, "url": _IBA_26_11}}},
    {
        "fy": 2028,
        "label": "FY2028 outlook: city $9.5M (adopted budget), IBA $32.9M (estimated at the proposed budget)",
        "figures": [
            {"value": 9.5, "source": {
                "doc": "FY2027 Adopted Budget Vol. I, Citywide Budget Overview, Table 10 (the city's updated Five-Year Financial Outlook: FY2028 shortfall)",
                "page": 36, "url": _CBO_FY27}},
            {"value": 32.9, "source": {
                "doc": "IBA Report 26-15, Recommended City Council Modifications to the Mayor's Proposed FY 2027 Budget (projected FY2028 deficit of $32.9M \"as estimated at the time of the Proposed Budget\", excluding reserve deposits)",
                "page": 43, "url": _IBA_26_15}},
        ],
    },
]


DEFICIT_YEARS = list(range(2012, 2028))
_DEFICIT_M_FIELDS = ("structural_deficit_m", "one_time_resources_m", "one_time_expenditures_m", "suspended_reserve_m")


def _check_deficit_entry(i: int, e: dict) -> None:
    if not isinstance(e.get("basis"), str) or not e["basis"].strip():
        raise ValueError(f"[{i}].basis: required non-empty string")
    if not isinstance(e.get("resources_include_reserve"), bool):
        raise ValueError(f"[{i}].resources_include_reserve: required boolean")
    if not isinstance(e.get("reported"), bool):
        raise ValueError(f"[{i}].reported: required boolean")
    if e["reported"]:
        if e.get("structural_deficit_m") is None:
            raise ValueError(f"[{i}].structural_deficit_m: required when reported is true (FY{e.get('fy')})")
    else:
        for k in _DEFICIT_M_FIELDS:
            if e.get(k) is not None:
                raise ValueError(f"[{i}].{k}: must be null when reported is false (FY{e.get('fy')})")
        if e.get("components") is not None:
            raise ValueError(f"[{i}].components: must be null when reported is false (FY{e.get('fy')})")


def build_structural_deficit(entries: list[dict], series: dict) -> dict:
    """Curated per-FY structural deficit entries, each with that FY's adopted GF expense merged in.

    Invariants: exactly one entry per FY2012-FY2027; a reported year has a figure; an unreported
    year has no figures and no components (never interpolate a year the IBA did not report)."""
    gf = series["gf_by_fy"]
    years = []
    for i, e in enumerate(entries):
        _check_deficit_entry(i, e)
    fys = [e.get("fy") for e in entries]
    dupes = sorted({fy for fy in fys if fys.count(fy) > 1})
    if dupes:
        raise ValueError(f"years: duplicate fy {dupes}")
    if sorted(fys) != DEFICIT_YEARS:
        missing = sorted(set(DEFICIT_YEARS) - set(fys))
        extra = sorted(set(fys) - set(DEFICIT_YEARS), key=str)
        raise ValueError(f"years: must cover exactly FY2012-FY2027 (missing {missing}, unexpected {extra})")
    for e in sorted(entries, key=lambda e: e["fy"]):
        fy_totals = gf.get(str(e["fy"])) or gf.get(e["fy"])
        years.append({**e, "gf_expenditure_adopted_m": fy_totals["expense_m"] if fy_totals else None})
    for i, m in enumerate(DEFICIT_MARKERS):
        if "figures" in m:
            for j, fig in enumerate(m["figures"]):
                curated.validate_figure(fig, f"markers[{i}].figures[{j}]")
        else:
            _check_source((m.get("source") or {}).get("source"), f"markers[{i}].source")
    return {"convention": DEFICIT_CONVENTION, "years": years, "markers": DEFICIT_MARKERS}


def _check_source(src, path: str) -> None:
    """Validate a bare Source (no value) with the same rules as a Figure's source."""
    if not isinstance(src, dict):
        raise ValueError(f"{path}: missing source")
    curated.validate_figure({"value": 0, "source": src}, path)


FLOW_KINDS = {"discretionary", "utility", "restricted", "borrowed"}


def build_flows(flows: dict) -> dict:
    """Validate the money-flow graph: unique node ids, no dangling links, sourced refs, one highlight."""
    ids = [n["id"] for n in flows["nodes"]]
    for i in {x for x in ids if ids.count(x) > 1}:
        raise ValueError(f"nodes: duplicate id {i!r}")
    known = set(ids)
    for k, n in enumerate(flows["nodes"]):
        if n.get("kind") not in FLOW_KINDS:
            raise ValueError(f"nodes[{k}].kind: must be one of {sorted(FLOW_KINDS)}, got {n.get('kind')!r}")
    for k, link in enumerate(flows["links"]):
        path = f"links[{k}]"
        for end in ("source", "target"):
            if link[end] not in known:
                raise ValueError(f"{path}.{end}: unknown node id {link[end]!r}")
        if not isinstance(link.get("amount_m"), (int, float)) or isinstance(link.get("amount_m"), bool):
            raise ValueError(f"{path}.amount_m: must be a number")
        if not isinstance(link.get("rule"), str) or not link["rule"].strip():
            raise ValueError(f"{path}.rule: required non-empty string")
        _check_source(link.get("ref"), f"{path}.ref")
    n = sum(1 for link in flows["links"] if link.get("highlight") is True)
    if n != 1:
        raise ValueError(f"links: exactly one highlight required, found {n}")
    return flows


def build_cuts(cuts: dict) -> dict:
    """Pass-through for cuts.json; reason_source on each reduction must be a valid Source."""
    for i, r in enumerate(cuts["reductions"]):
        _check_source(r.get("source"), f"reductions[{i}].source")
        _check_source(r.get("reason_source"), f"reductions[{i}].reason_source")
        if not isinstance(r.get("reason"), str) or not r["reason"].strip():
            raise ValueError(f"reductions[{i}].reason: required non-empty string")
    for i, r in enumerate(cuts["restorations"]):
        _check_source(r.get("source"), f"restorations[{i}].source")
    return cuts


BIKE_GROUP = "Bike & pedestrian projects"
ROAD_GROUP = "Road repair"


def _bike_chart(cip_rows: list[dict]) -> tuple[dict | None, list[str]]:
    """Adopted CIP for the latest FY with adopted rows, bucketed by fund type.

    A project matching both matchers (e.g. a bikeway repaving) counts once, as bike."""
    adopted = [r for r in cip_rows if r["cycle"] == "adopted"]
    if not adopted:
        return None, []
    fy = max(r["fy"] for r in adopted)
    sums = {BIKE_GROUP: {}, ROAD_GROUP: {}}
    matched = set()
    for r in adopted:
        if r["fy"] != fy:
            continue
        name = r["project_name"]
        if is_bike_project(name):
            group = BIKE_GROUP
            matched.add(name)
        elif is_road_repair(name):
            group = ROAD_GROUP
        else:
            continue
        sums[group][r["fund_type"]] = sums[group].get(r["fund_type"], 0.0) + r["amount"] / 1e6
    total = {f: sum(g.get(f, 0.0) for g in sums.values()) for g in sums.values() for f in g}
    # Fund types under $10k across both groups would only add empty bars.
    funds = sorted((f for f, t in total.items() if t >= 0.01), key=lambda f: -total[f])
    groups = [{"label": label, "series": [{"label": f, "amount_m": sums[label].get(f, 0.0)} for f in funds]}
              for label in (BIKE_GROUP, ROAD_GROUP)]
    return {"type": "grouped_bar", "fy": fy, "groups": groups}, sorted(matched)


def _homelessness_chart(series: dict, funnel: dict | None = None) -> dict:
    points = []
    for fy in sorted(series["gf_dept_by_fy"], key=int):
        amount = sum(a for d, a in series["gf_dept_by_fy"][fy] if "Homelessness" in d)
        has_dept = any("Homelessness" in d for d, _ in series["gf_dept_by_fy"][fy])
        total = (series["gf_by_fy"].get(fy) or {}).get("expense_m")
        if has_dept and total:
            points.append({"fy": int(fy), "amount_m": amount, "share_pct": amount / total * 100})
    chart = {"type": "line", "points": points, "adopted_next": None}
    # The adopted budget's next year is not in the CSV yet; carry the printed figure (funnel bar4) as a labelled point.
    if funnel:
        dept = next((b for b in funnel.get("bar4", []) if "Homelessness" in b["dept"]), None)
        if dept and (not points or funnel["fy"] > points[-1]["fy"]):
            chart["adopted_next"] = {"fy": funnel["fy"], "amount_m": dept["amount_m"]}
    return chart


def build_claims(curated_claims: list[dict], cip_rows: list[dict], series: dict, funnel: dict | None = None) -> list[dict]:
    """Claim-checker cards: curated text plus charts computed from the CSVs."""
    out = []
    for i, c in enumerate(curated_claims):
        for key in ("id", "claim", "finding", "caveat"):
            if not isinstance(c.get(key), str) or not c[key].strip():
                raise ValueError(f"claims[{i}].{key}: required non-empty string")
        if not c.get("sources"):
            raise ValueError(f"claims[{i}].sources: at least one source required")
        for k, src in enumerate(c["sources"]):
            _check_source(src, f"claims[{i}].sources[{k}]")
        card = {**c, "chart": c.get("chart"), "matched_projects": None}
        if c["id"] == "bike-lanes":
            card["chart"], card["matched_projects"] = _bike_chart(cip_rows)
        elif c["id"] == "homelessness":
            card["chart"] = _homelessness_chart(series, funnel)
        out.append(card)
    return out


def build_gap(gap: dict, funnel: dict) -> dict:
    """Gap figures plus cuttable_m, taken from the funnel rather than re-typed."""
    if "cuttable_m" in gap:
        raise ValueError("gap.cuttable_m: derived from funnel at build time; remove it from curated gap.json")
    return {**gap, "cuttable_m": funnel["bar3"]["everything_else_m"]}


def build_glossary(entries: list[dict]) -> list[dict]:
    for i, e in enumerate(entries):
        for key in ("term", "plain"):
            if not isinstance(e.get(key), str) or not e[key].strip():
                raise ValueError(f"glossary[{i}].{key}: required non-empty string")
    return entries


SUM_TOLERANCE_M = 0.3   # published tables are rounded, and the city notes they "may not foot"
PROJECT_TOLERANCE_M = 0.05


def _need_value(node, path: str) -> float:
    if not isinstance(node, dict) or "value" not in node:
        raise ValueError(f"{path}: figure required")
    return node["value"]


def _check_csv_mapping(m, path: str) -> None:
    if not isinstance(m, dict) or set(m) != {"types", "include", "exclude"}:
        raise ValueError(f"{path}: csv must have exactly types, include, exclude")
    t = m["types"]
    if not isinstance(t, list) or not t or not all(isinstance(x, str) and x.strip() for x in t):
        raise ValueError(f"{path}.types: non-empty list of account types required")
    for k in ("include", "exclude"):
        if m[k] is not None and not (isinstance(m[k], str) and m[k].strip()):
            raise ValueError(f"{path}.{k}: string or null required")


def build_gf_revenue(d: dict) -> dict:
    """FY2027 General Fund revenue (Vol. I Table 2): the 12 categories must sum to total_m within 0.3."""
    d = copy.deepcopy(d)
    total = _need_value(d.get("total_m"), "total_m")
    cats = d.get("categories")
    if not isinstance(cats, list) or not cats:
        raise ValueError("categories: non-empty list required")
    seen = set()
    for i, c in enumerate(cats):
        name = c.get("name")
        if not isinstance(name, str) or not name.strip() or name in seen:
            raise ValueError(f"categories[{i}].name: unique non-empty string required")
        seen.add(name)
        _check_csv_mapping(c.get("csv"), f"categories[{i}].csv")
        _need_value(c.get("amount_m"), f"categories[{i}].amount_m")
    s = sum(c["amount_m"]["value"] for c in cats)
    if abs(s - total) > SUM_TOLERANCE_M:
        raise ValueError(f"categories: sum {s:.1f} differs from total_m {total:.1f} by more than {SUM_TOLERANCE_M}")
    return d


def build_cip(d: dict) -> dict:
    """FY2027 adopted CIP. Departments must sum to total_m within 0.3, each department's listed
    projects may not exceed it (lists may be partial), and "Other sources" is derived as
    total_m minus the named sources."""
    d = copy.deepcopy(d)
    total_fig = d.get("total_m")
    total = _need_value(total_fig, "total_m")
    srcs, deps = d.get("sources"), d.get("departments")
    if not isinstance(srcs, list) or not isinstance(deps, list):
        raise ValueError("sources and departments: lists required")
    for i, s in enumerate(srcs):
        if s.get("name") == "Other sources":
            raise ValueError(f"sources[{i}]: 'Other sources' is derived at build time; remove it from curated cip")
        _need_value(s.get("amount_m"), f"sources[{i}].amount_m")
    named = sum(s["amount_m"]["value"] for s in srcs)
    other = round(total - named, 1)
    if other < 0:
        raise ValueError(f"sources: named sources sum {named:.1f} exceeds total_m {total:.1f}")
    for i, x in enumerate(deps):
        _need_value(x.get("amount_m"), f"departments[{i}].amount_m")
        for j, p in enumerate(x.get("projects", [])):
            _need_value(p.get("amount_m"), f"departments[{i}].projects[{j}].amount_m")
        ps = sum(p["amount_m"]["value"] for p in x.get("projects", []))
        if ps > x["amount_m"]["value"] + PROJECT_TOLERANCE_M:
            raise ValueError(f"departments[{i}].projects: sum {ps:.1f} exceeds department {x['amount_m']['value']:.1f}")
    dsum = sum(x["amount_m"]["value"] for x in deps)
    if abs(dsum - total) > SUM_TOLERANCE_M:
        raise ValueError(f"departments: sum {dsum:.1f} differs from total_m {total:.1f} by more than {SUM_TOLERANCE_M}")
    parts = " + ".join(f"{s['amount_m']['value']:.1f}" for s in srcs)
    d["sources"].append({"name": "Other sources", "amount_m": {"value": other, "source": {
        "doc": (f"our arithmetic: {total:.1f} (Grand Total) - {named:.1f} (sum of the {len(srcs)} named sources: {parts}) "
                f"= {other:.1f}; stands for the other Table 1 lines combined, as a difference of rounded figures"),
        "page": total_fig["source"]["page"], "url": total_fig["source"]["url"]}}})
    return d


LABEL_POTS = ("general_fund", "utilities", "purpose", "cip", "internal")
LABEL_CSV_POTS = ("utilities", "purpose", "internal")   # maps drawn from the operating-budget CSV
LABEL_ANSWERS = ("what", "money_from", "committed_to", "who_decides")
LABEL_LINKS = {"#why-short", "#gap", "#reserves", "#infrastructure", "#pension", "#how-long", "#claims", None}
# {detail_fy} is filled in by the tree builder with the CSV detail year (2026 today).
LABEL_DETAIL_SENTENCE = ("The detail below is from last year's budget (FY{detail_fy}), because this year's "
                         "line-by-line data isn't published yet.")
ANSWER_MAX_SENTENCES = 3
DESC_MAX_SENTENCES = 2
_SENTENCE_END = re.compile(r"[.!?][\"'\u2019\u201d)\]]*(?=\s|$)")


def _sentences(text: str) -> int:
    """Sentence count: a ., ! or ? (optionally followed by a closing quote or bracket) at a space or the end.
    Decimals such as $1.59B do not count. Text with no end mark counts as one sentence."""
    return len(_SENTENCE_END.findall(text.strip())) or 1


def _label_text(entry, path: str, max_sentences: int) -> str:
    if not isinstance(entry, dict):
        raise ValueError(f"{path}: object required")
    text = entry.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"{path}.text: required non-empty string")
    n = _sentences(text)
    if n > max_sentences:
        raise ValueError(f"{path}.text: {n} sentences, at most {max_sentences} allowed")
    return text


def _label_link(entry: dict, path: str) -> None:
    if entry.get("link") not in LABEL_LINKS:
        raise ValueError(f"{path}.link: {entry.get('link')!r} is not one of {sorted(k for k in LABEL_LINKS if k)} or null")


def build_labels(d: dict) -> dict:
    """Plain copy for the budget maps: four sourced answers for each of the five pots, a cited
    description per named box (nodes), and one shared, unsourced definition per category."""
    d = copy.deepcopy(d)
    pots, nodes, cats = d.get("pots"), d.get("nodes"), d.get("categories")
    if not all(isinstance(x, dict) for x in (pots, nodes, cats)):
        raise ValueError("labels: pots, nodes and categories must be objects")
    if set(pots) != set(LABEL_POTS):
        missing, extra = sorted(set(LABEL_POTS) - set(pots)), sorted(set(pots) - set(LABEL_POTS))
        raise ValueError(f"pots: missing {missing}, unknown {extra}")
    for pid in LABEL_POTS:
        if not isinstance(pots[pid], dict):
            raise ValueError(f"pots.{pid}: object required")
        for k in LABEL_ANSWERS:
            path = f"pots.{pid}.{k}"
            a = pots[pid].get(k)
            text = _label_text(a, path, ANSWER_MAX_SENTENCES)
            _check_source(a.get("source"), f"{path}.source")
            if k == "what" and pid in LABEL_CSV_POTS and not text.rstrip().endswith(LABEL_DETAIL_SENTENCE):
                raise ValueError(f"{path}.text: must end with the detail-year sentence {LABEL_DETAIL_SENTENCE!r}")
    for key, n in nodes.items():
        path = f"nodes[{key!r}]"
        if not key.strip():
            raise ValueError(f"{path}: blank key")
        _label_text(n, path, DESC_MAX_SENTENCES)
        _check_source(n.get("source"), f"{path}.source")
        _label_link(n, path)
    for key, c in cats.items():
        path = f"categories[{key!r}]"
        if not key.strip():
            raise ValueError(f"{path}: blank key")
        _label_text(c, path, DESC_MAX_SENTENCES)
        if "source" in c:
            raise ValueError(f"{path}.source: categories are shared definitions and carry no source")
        _label_link(c, path)
    return d


WHY_SLICE_TOLERANCE = 0.2   # the County's chart prints one decimal; its slices sum to 100.0
WHY_GROUP_TOLERANCE = 0.05
WHY_FIGURES = {
    "property_dollar": ("cities_cents",),
    "sales_tax": ("sd_rate_pct", "city_cents_of_rate"),
    "hotel": ("base_cents", "gf_cents", "promo_cents", "council_cents", "gf_m"),
    "trash": ("moved_m", "positions", "fee_monthly", "settlement_gf_fy2028_m"),
    "growth": ("revenue_pct", "inflation_pct"),
    "prop13": ("rate_pct", "cap_pct", "lag_low_months", "lag_high_months"),
}


def build_why_short(d: dict) -> dict:
    """Section 2 figures. Checks: the County's property-tax slices sum to 100 cents (within 0.2), the "Cities"
    slices add up to cities_cents, the Measure E margin is no - yes votes and labeled our arithmetic, San Diego
    is among the peer rates at sd_rate_pct, the hotel cents add up to the base rate, and every required figure, period and source is present."""
    d = copy.deepcopy(d)
    for sec, keys in WHY_FIGURES.items():
        if not isinstance(d.get(sec), dict):
            raise ValueError(f"{sec}: object required")
        for k in keys:
            _need_value(d[sec].get(k), f"{sec}.{k}")
    for k in ("property_tax_m", "property_tax_share_pct"):
        _need_value(d.get(k), k)
    pd = d["property_dollar"]
    slices = pd.get("slices")
    if not isinstance(slices, list) or not slices:
        raise ValueError("property_dollar.slices: non-empty list required")
    labels = set()
    for i, s in enumerate(slices):
        label = s.get("label") if isinstance(s, dict) else None
        if not isinstance(label, str) or not label.strip() or label in labels:
            raise ValueError(f"property_dollar.slices[{i}].label: unique non-empty string required")
        labels.add(label)
        if _need_value(s.get("cents"), f"property_dollar.slices[{i}].cents") < 0:
            raise ValueError(f"property_dollar.slices[{i}].cents: negative")
    total = sum(s["cents"]["value"] for s in slices)
    if abs(total - 100) > WHY_SLICE_TOLERANCE:
        raise ValueError(f"property_dollar.slices: sum {total:.1f} cents differs from 100 by more than {WHY_SLICE_TOLERANCE}")
    cities = sum(s["cents"]["value"] for s in slices if s.get("group", s["label"]) == "Cities")
    if abs(cities - pd["cities_cents"]["value"]) > WHY_GROUP_TOLERANCE:
        raise ValueError(f"property_dollar.cities_cents: {pd['cities_cents']['value']} but the Cities slices sum to {cities:.1f}")
    if not isinstance(pd.get("note"), str) or not pd["note"].strip():
        raise ValueError("property_dollar.note: required non-empty string")

    st = d["sales_tax"]
    peers = st.get("peers")
    if not isinstance(peers, list) or len(peers) < 2:
        raise ValueError("sales_tax.peers: list of at least two cities required")
    seen = set()
    for i, p in enumerate(peers):
        city = p.get("city") if isinstance(p, dict) else None
        if not isinstance(city, str) or not city.strip() or city in seen:
            raise ValueError(f"sales_tax.peers[{i}].city: unique non-empty string required")
        seen.add(city)
        _need_value(p.get("rate_pct"), f"sales_tax.peers[{i}].rate_pct")
    sd = next((p for p in peers if p["city"] == "San Diego"), None)
    if sd is None or sd["rate_pct"]["value"] != st["sd_rate_pct"]["value"]:
        raise ValueError("sales_tax.peers: San Diego must be listed at sd_rate_pct")
    me = st.get("measure_e")
    if not isinstance(me, dict):
        raise ValueError("sales_tax.measure_e: object required")
    vals = {k: _need_value(me.get(k), f"sales_tax.measure_e.{k}")
            for k in ("yes_pct", "no_pct", "yes_votes", "no_votes", "margin_votes", "est_annual_m")}
    if vals["margin_votes"] != vals["no_votes"] - vals["yes_votes"]:
        raise ValueError(f"sales_tax.measure_e.margin_votes: {vals['margin_votes']} is not no_votes - yes_votes "
                         f"({vals['no_votes'] - vals['yes_votes']})")
    if not me["margin_votes"]["source"]["doc"].startswith("our arithmetic: "):
        raise ValueError("sales_tax.measure_e.margin_votes: a computed figure must be labeled 'our arithmetic: '")
    if abs(vals["yes_pct"] + vals["no_pct"] - 100) > 0.011:
        raise ValueError("sales_tax.measure_e: yes_pct + no_pct must be 100")

    if d["hotel"]["gf_cents"]["value"] >= d["hotel"]["base_cents"]["value"]:
        raise ValueError("hotel.gf_cents: must be less than base_cents")
    ho = {k: d["hotel"][k]["value"] for k in ("base_cents", "gf_cents", "promo_cents", "council_cents")}
    if abs(ho["gf_cents"] + ho["promo_cents"] + ho["council_cents"] - ho["base_cents"]) > WHY_GROUP_TOLERANCE:
        raise ValueError("hotel: gf_cents + promo_cents + council_cents must equal base_cents")
    for k in ("revenue_period", "inflation_period"):
        if not isinstance(d["growth"].get(k), str) or not d["growth"][k].strip():
            raise ValueError(f"growth.{k}: required non-empty string (state both periods; they differ)")
    q = d.get("quote")
    if not isinstance(q, dict) or not isinstance(q.get("text"), str) or not q["text"].strip():
        raise ValueError("quote.text: required non-empty string")
    _check_source(q.get("source"), "quote.source")
    cites = d.get("cites")
    if not isinstance(cites, dict):
        raise ValueError("cites: object required")
    for k, v in cites.items():
        _check_source(v, f"cites.{k}")
    return d


class BuildCheckError(RuntimeError):
    """checks.run reported failures on the freshly built files; out_dir was left untouched."""

    def __init__(self, failures: list[str]):
        super().__init__("; ".join(failures))
        self.failures = failures


def build_all(raw_dir: Path, curated_dir: Path, out_dir: Path, check: bool = False) -> list[Path]:
    """Write every published file. To add a file, append one (name, fn) to steps.

    Files are written to a temporary directory next to out_dir. Only when every step succeeds
    (and, with check=True, checks.run reports nothing) is out_dir replaced; otherwise out_dir is
    untouched and the temporary directory is removed."""
    raw_dir, curated_dir, out_dir = Path(raw_dir), Path(curated_dir), Path(out_dir)
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{out_dir.name}.tmp-", dir=out_dir.parent))
    try:
        names = _build_into(raw_dir, curated_dir, tmp)
        if check:
            from pipeline import checks
            failures = checks.run(tmp)
            if failures:
                raise BuildCheckError(failures)
        _swap(tmp, out_dir)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return [out_dir / n for n in names]


def _swap(new: Path, out_dir: Path) -> None:
    """Replace out_dir with new: two renames on the same filesystem, the old copy removed last."""
    if out_dir.exists():
        old = Path(tempfile.mkdtemp(prefix=f".{out_dir.name}.old-", dir=out_dir.parent))
        os.rmdir(old)
        os.rename(out_dir, old)
        try:
            os.rename(new, out_dir)
        except BaseException:
            os.rename(old, out_dir)
            raise
        shutil.rmtree(old, ignore_errors=True)
    else:
        os.rename(new, out_dir)


def _build_into(raw_dir: Path, curated_dir: Path, out_dir: Path) -> list[str]:
    rows = load_budget_rows(raw_dir)
    series = build_series(rows, _vintage(raw_dir))
    cip_rows = load_cip_rows(raw_dir)
    steps = [
        ("series", lambda: series),
        ("headline", lambda: curated.load(curated_dir, "headline")),
        ("funnel", lambda: curated.load(curated_dir, "funnel")),
        ("cuts", lambda: build_cuts(curated.load(curated_dir, "cuts"))),
        ("flows", lambda: build_flows(curated.load(curated_dir, "flows"))),
        ("structural_deficit", lambda: build_structural_deficit(
            curated.load(curated_dir, "structural_deficit"), series)),
        ("gap", lambda: build_gap(curated.load(curated_dir, "gap"), curated.load(curated_dir, "funnel"))),
        ("claims", lambda: build_claims(curated.load(curated_dir, "claims"), cip_rows, series,
                                         curated.load(curated_dir, "funnel"))),
        ("glossary", lambda: build_glossary(curated.load(curated_dir, "glossary"))),
        ("budget_tree", lambda: build_budget_tree(
            rows, load_fund_names(raw_dir),
            headline=curated.load(curated_dir, "headline"),
            funnel=curated.load(curated_dir, "funnel"),
            gf_revenue=build_gf_revenue(curated.load(curated_dir, "gf_revenue_fy2027")),
            cip=build_cip(curated.load(curated_dir, "cip_fy2027")),
            labels=build_labels(curated.load(curated_dir, "labels")),
            unmatched=unmatched_rows(raw_dir))),
        ("why_short", lambda: build_why_short(curated.load(curated_dir, "why_short"))),
        # Stubs until Tasks 10-11 replace them with validators; passed through so the page's loadData finds them.
        ("gap_story", lambda: curated.load(curated_dir, "gap_story")),
        ("piles_up", lambda: curated.load(curated_dir, "piles_up")),
    ]
    return [_write(out_dir, name, fn()).name for name, fn in steps]


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    out_dir = root / "data" / "build"
    try:
        build_all(root / "data" / "raw", root / "data" / "curated", out_dir, check=True)
    except BuildCheckError as e:
        for msg in e.failures:
            print(f"CHECK FAILED: {msg}", file=sys.stderr)
        print(f"build failed; {out_dir} left unchanged", file=sys.stderr)
        return 1
    except (ValueError, KeyError, OSError) as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        print(f"build failed; {out_dir} left unchanged", file=sys.stderr)
        return 1
    print(f"build ok: {out_dir}")
    return 0
