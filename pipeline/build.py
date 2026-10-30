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
]


def money_token(v) -> str:
    """A money amount as copy writes it and site/format.js moneyToken() finds it: "$9.5M", and "$12M" for 12.0
    (the shortest round-trip number, as JavaScript's String() writes it)."""
    v = float(v)
    return f"${int(v)}M" if v.is_integer() else f"${v!r}M"


def coming_marker(coming: dict) -> dict:
    """The chart's "what's coming" marker, built from gap_story.headlines.coming (ruling R15: the pair has one home)."""
    return {
        "fy": coming["fy"],
        "label": (f"FY{coming['fy']} outlook: city {money_token(coming['city_m']['value'])} ({coming['city_stage']}), "
                  f"IBA {money_token(coming['iba_m']['value'])} ({coming['iba_stage']})"),
        "figures": [coming["city_m"], coming["iba_m"]],
    }


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


def build_structural_deficit(entries: list[dict], series: dict, coming: dict | None = None) -> dict:
    """Curated per-FY structural deficit entries, each with that FY's adopted GF expense merged in. The markers are
    DEFICIT_MARKERS plus, given gap_story's validated headlines.coming, the FY2028 outlook marker built from it.

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
    markers = DEFICIT_MARKERS + ([coming_marker(coming)] if coming else [])
    for i, m in enumerate(markers):
        if "figures" in m:
            for j, fig in enumerate(m["figures"]):
                curated.validate_figure(fig, f"markers[{i}].figures[{j}]")
        else:
            _check_source((m.get("source") or {}).get("source"), f"markers[{i}].source")
    return {"convention": DEFICIT_CONVENTION, "years": years, "markers": markers}


def share_urls(d: dict, min_count: int = 2) -> dict:
    """Ruling R16 (size): store each document URL cited at least min_count times once, in a top-level `urls` table,
    and have each Source cite it by key ("u0", "u1", ... in first-use order). Run after validation. Readers expand
    the keys back (site/sources.js expandUrls), so the site sees ordinary Sources."""
    counts: dict[str, int] = {}

    def sources(v):
        if isinstance(v, dict):
            if isinstance(v.get("doc"), str) and isinstance(v.get("url"), str):
                yield v
            for x in v.values():
                yield from sources(x)
        elif isinstance(v, list):
            for x in v:
                yield from sources(x)
    out = copy.deepcopy(d)
    for s in sources(out):
        counts[s["url"]] = counts.get(s["url"], 0) + 1
    keys: dict[str, str] = {}
    for s in sources(out):
        if counts[s["url"]] >= min_count:
            s["url"] = keys.setdefault(s["url"], f"u{len(keys)}")
    out["urls"] = {k: u for u, k in keys.items()}
    return out


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
        if "link" in c and not (isinstance(c["link"], str) and c["link"].startswith("#") and len(c["link"]) > 1):
            raise ValueError(f"claims[{i}].link: an in-page anchor such as \"#infrastructure\"")
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
        "doc": (f"our arithmetic: {total:.1f} (Grand Total) - {named:.1f} (the {len(srcs)} named sources: {parts}) "
                f"= {other:.1f}, the other Table 1 lines combined (rounded figures)"),
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
    st["county"] = _check_county_sales_tax(st.get("county"), st["sd_rate_pct"]["value"])

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


COUNTY_CITIES = 18  # incorporated cities in San Diego County


def _check_county_sales_tax(c, sd_rate: float) -> dict:
    """County sales-tax comparison. Checks: all 18 cities listed once; the countywide base is the state rate plus
    TransNet and equals the unincorporated rate; each city's total is the base plus its own add-on (none means the
    base); San Diego has no add-on and sits at sd_rate. Adds n_addon / n_none, labeled our arithmetic."""
    if not isinstance(c, dict):
        raise ValueError("sales_tax.county: object required")
    if not isinstance(c.get("effective"), str) or not c["effective"].strip():
        raise ValueError("sales_tax.county.effective: required non-empty string")
    base = _need_value(c.get("state_pct"), "sales_tax.county.state_pct") + _need_value(c.get("transnet_pct"), "sales_tax.county.transnet_pct")
    if abs(_need_value(c.get("unincorporated_pct"), "sales_tax.county.unincorporated_pct") - base) > 1e-9:
        raise ValueError(f"sales_tax.county.unincorporated_pct: must equal state + TransNet ({base})")
    cities = c.get("cities")
    if not isinstance(cities, list) or len(cities) != COUNTY_CITIES:
        raise ValueError(f"sales_tax.county.cities: exactly {COUNTY_CITIES} cities required")
    seen = set()
    for i, x in enumerate(cities):
        name = x.get("city") if isinstance(x, dict) else None
        if not isinstance(name, str) or not name.strip() or name in seen:
            raise ValueError(f"sales_tax.county.cities[{i}].city: unique non-empty string required")
        seen.add(name)
        total = _need_value(x.get("rate_pct"), f"sales_tax.county.cities[{i}].rate_pct")
        add = _need_value(x["addon_pct"], f"sales_tax.county.cities[{i}].addon_pct") if "addon_pct" in x else 0.0
        if add < 0 or abs(total - (base + add)) > 1e-9:
            raise ValueError(f"sales_tax.county.cities[{i}] ({name}): total {total} is not base {base} + add-on {add}")
    sd = next((x for x in cities if x["city"] == "San Diego"), None)
    if sd is None or "addon_pct" in sd or sd["rate_pct"]["value"] != sd_rate:
        raise ValueError("sales_tax.county.cities: San Diego must be listed at sd_rate_pct with no add-on")
    with_addon = sorted(x["city"] for x in cities if "addon_pct" in x)
    without = sorted(x["city"] for x in cities if "addon_pct" not in x)
    src = c["transnet_pct"]["source"]  # the same CDTFA-105 page lists every city add-on
    for key, names, what in (("n_addon", with_addon, "with"), ("n_none", without, "with no")):
        c[key] = {"value": len(names), "source": {
            "doc": f"our arithmetic: cities {what} a city sales tax of their own in CDTFA-105, counted: {', '.join(names)}",
            "page": src["page"], "url": src["url"]}}
    for k, v in (c.get("cites") or {}).items():
        _check_source(v, f"sales_tax.county.cites.{k}")
    c["ballot"] = _check_ballot(c.get("ballot"))
    return c


def _per_resident(amount_m, population, path: str) -> dict:
    """A yearly amount spread evenly over a population, to the nearest dollar, labeled our arithmetic."""
    per = round(amount_m["value"] * 1e6 / population["value"])
    return {"value": per, "source": {
        "doc": f"our arithmetic: ${amount_m['value']:g}M a year / {population['value']:,} residents (January 2026) = ${per:,} per resident per year, "
               f"if spread evenly; visitors and businesses pay part of any sales tax",
        "page": amount_m["source"]["page"], "url": amount_m["source"]["url"]}}


def _check_ballot(b) -> dict:
    """The November 3, 2026 sales-tax measures. Checks every figure and citation, that the county shares are each
    between 0 and 100, and adds per-resident figures (our arithmetic) from the estimates and the E-5 populations."""
    if not isinstance(b, dict) or not isinstance(b.get("county"), dict) or not isinstance(b.get("santee"), dict):
        raise ValueError("sales_tax.county.ballot: objects county and santee required")
    co, sa = b["county"], b["santee"]
    for who, obj, keys in (("county", co, ("est_low_m", "est_high_m", "population")), ("santee", sa, ("est_m", "years", "population"))):
        _text(obj.get("measure"), f"sales_tax.county.ballot.{who}.measure")
        for k in keys:
            _need_value(obj.get(k), f"sales_tax.county.ballot.{who}.{k}")
        for k, v in (obj.get("cites") or {}).items():
            _check_source(v, f"sales_tax.county.ballot.{who}.cites.{k}")
    if co["est_low_m"]["value"] > co["est_high_m"]["value"]:
        raise ValueError("sales_tax.county.ballot.county: est_low_m must not exceed est_high_m")
    shares = co.get("shares")
    if not isinstance(shares, list) or not shares:
        raise ValueError("sales_tax.county.ballot.county.shares: non-empty list required")
    for i, sh in enumerate(shares):
        _text(sh.get("label"), f"sales_tax.county.ballot.county.shares[{i}].label")
        if not isinstance(sh.get("cap"), bool):
            raise ValueError(f"sales_tax.county.ballot.county.shares[{i}].cap: true/false required")
        pct = _need_value(sh.get("pct"), f"sales_tax.county.ballot.county.shares[{i}].pct")
        if not 0 < pct <= 100:
            raise ValueError(f"sales_tax.county.ballot.county.shares[{i}].pct: must be between 0 and 100")
    co["per_resident_low"] = _per_resident(co["est_low_m"], co["population"], "county")
    co["per_resident_high"] = _per_resident(co["est_high_m"], co["population"], "county")
    sa["per_resident"] = _per_resident(sa["est_m"], sa["population"], "santee")
    return b


GAP_TOLERANCE_M = 0.05
WATERFALL_KINDS = ("start", "up", "down", "subtotal", "end")
GAP_OFFICES = ("IBA", "City")
_OURS = "our arithmetic: "
FORECAST_CITE_ANCHOR = "A new forecast is due"  # site/gapstory.js noteParts() starts the cite here


def _text(v, path: str) -> str:
    if not isinstance(v, str) or not v.strip():
        raise ValueError(f"{path}: required non-empty string")
    return v


def _ours(fig, path: str, expected: bool) -> None:
    is_ours = fig["source"]["doc"].startswith(_OURS)
    if is_ours != expected:
        raise ValueError(f"{path}: {'a computed figure must be labeled' if expected else 'only computed figures may be labeled'} "
                         f"'{_OURS}'")


def _check_waterfall(steps) -> None:
    """Runs the steps as a running total: subtotals must equal it, and the end must bring it to 0 (within 0.05)."""
    if not isinstance(steps, list) or len(steps) < 2:
        raise ValueError("waterfall: list of at least two steps required")
    total = 0.0
    for i, st in enumerate(steps):
        path = f"waterfall[{i}]"
        if not isinstance(st, dict):
            raise ValueError(f"{path}: object required")
        _text(st.get("label"), f"{path}.label")
        kind = st.get("kind")
        if kind not in WATERFALL_KINDS:
            raise ValueError(f"{path}.kind: {kind!r} is not one of {', '.join(WATERFALL_KINDS)}")
        if (kind == "start") != (i == 0) or (kind == "end") != (i == len(steps) - 1):
            raise ValueError(f"{path}.kind: the first step must be the only start and the last the only end")
        amt = _need_value(st.get("amount_m"), f"{path}.amount_m")
        if amt < 0:
            raise ValueError(f"{path}.amount_m: amounts are sizes; the kind gives the direction")
        if not isinstance(st.get("our_arithmetic"), bool):
            raise ValueError(f"{path}.our_arithmetic: true or false required")
        _ours(st["amount_m"], f"{path}.amount_m", st["our_arithmetic"])
        if st.get("positions") is not None:
            _need_value(st["positions"], f"{path}.positions")
        if kind == "start":
            total = amt
        elif kind == "up":
            total += amt
        elif kind == "down":
            total -= amt
        elif abs(amt - total) > GAP_TOLERANCE_M:
            raise ValueError(f"{path}: {kind} {amt} but the running total is {total:.2f}")
    if abs(total) > GAP_TOLERANCE_M:
        raise ValueError(f"waterfall: the steps end at {total:.2f}, not 0; the budget must close")


def build_gap_story(d: dict) -> dict:
    """Section 3 figures. Checks: the waterfall closes to 0 and its subtotals match the running total; the
    residual adds up (one_time - one_time_uses = ongoing; ongoing + skipped_reserve = with_reserve, labeled our
    arithmetic); every headline, timeline entry and definition is complete; every Figure is valid (curated.load)."""
    d = copy.deepcopy(d)
    h = d.get("headlines")
    if not isinstance(h, dict):
        raise ValueError("headlines: object required")
    for k in ("this_year", "worst", "coming"):
        if not isinstance(h.get(k), dict):
            raise ValueError(f"headlines.{k}: object required")
    _need_value(h["this_year"].get("value_m"), "headlines.this_year.value_m")
    _text(h["this_year"].get("counting"), "headlines.this_year.counting")
    for i, ct in enumerate(h["this_year"].get("cites") or []):
        path = f"headlines.this_year.cites[{i}]"
        if _text(ct.get("text") if isinstance(ct, dict) else None, f"{path}.text") not in h["this_year"]["counting"]:
            raise ValueError(f"{path}.text: {ct['text']!r} must appear in headlines.this_year.counting")
        _check_source(ct.get("source"), f"{path}.source")
    w = h["worst"]
    for k in ("value_m", "without_reserve_m"):
        _need_value(w.get(k), f"headlines.worst.{k}")
    _text(w.get("counting"), "headlines.worst.counting")
    if not isinstance(w.get("fy"), int) or w["without_reserve_m"]["value"] > w["value_m"]["value"]:
        raise ValueError("headlines.worst: fy (int) required, and without_reserve_m cannot exceed value_m")
    c = h["coming"]
    if not isinstance(c.get("fy"), int):
        raise ValueError("headlines.coming.fy: int required")
    for k in ("city_m", "iba_m"):
        _need_value(c.get(k), f"headlines.coming.{k}")
    for k in ("note", "city_counting", "iba_counting", "city_stage", "iba_stage"):
        _text(c.get(k), f"headlines.coming.{k}")
    token = money_token(c["city_m"]["value"])
    if token not in c["note"]:
        raise ValueError(f"headlines.coming.note: must name the city's figure as it is shown ({token})")
    if FORECAST_CITE_ANCHOR not in c["note"]:
        raise ValueError(f"headlines.coming.note: must contain {FORECAST_CITE_ANCHOR!r}, where the forecast-date cite starts")
    sett = c.get("settlement")
    if not isinstance(sett, list) or not sett:
        raise ValueError("headlines.coming.settlement: non-empty list required")
    for i, s in enumerate(sett):
        _text(s.get("label") if isinstance(s, dict) else None, f"headlines.coming.settlement[{i}].label")
        _need_value(s.get("amount_m"), f"headlines.coming.settlement[{i}].amount_m")
    due = c.get("forecast_due")
    if not isinstance(due, dict) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(due.get("date", ""))):
        raise ValueError("headlines.coming.forecast_due: date (YYYY-MM-DD) required")
    _check_source(due.get("source"), "headlines.coming.forecast_due.source")

    _check_waterfall(d.get("waterfall"))
    note = d.get("adopted_note")
    _need_value(note.get("positions_change") if isinstance(note, dict) else None, "adopted_note.positions_change")

    r = d.get("residual")
    if not isinstance(r, dict):
        raise ValueError("residual: object required")
    v = {k: _need_value(r.get(k), f"residual.{k}") for k in (
        "one_time_m", "one_time_uses_m", "ongoing_m", "skipped_reserve_m", "with_reserve_m", "iba_proposed_m", "iba_may_m")}
    if abs(v["one_time_m"] - v["one_time_uses_m"] - v["ongoing_m"]) > GAP_TOLERANCE_M:
        raise ValueError("residual.ongoing_m: must equal one_time_m - one_time_uses_m")
    if abs(v["ongoing_m"] + v["skipped_reserve_m"] - v["with_reserve_m"]) > GAP_TOLERANCE_M:
        raise ValueError("residual.with_reserve_m: must equal ongoing_m + skipped_reserve_m")
    _ours(r["with_reserve_m"], "residual.with_reserve_m", True)

    defs = d.get("definitions")
    if not isinstance(defs, list) or not defs:
        raise ValueError("definitions: non-empty list required")
    for i, x in enumerate(defs):
        for k in ("term", "plain"):
            _text(x.get(k) if isinstance(x, dict) else None, f"definitions[{i}].{k}")
        _check_source(x.get("source"), f"definitions[{i}].source")

    tl = d.get("timeline")
    if not isinstance(tl, list) or not tl:
        raise ValueError("timeline: non-empty list required")
    for i, e in enumerate(tl):
        path = f"timeline[{i}]"
        if not isinstance(e, dict) or not re.fullmatch(r"20\d\d-(0[1-9]|1[0-2])", str(e.get("date", ""))):
            raise ValueError(f"{path}.date: YYYY-MM required")
        if e.get("office") not in GAP_OFFICES:
            raise ValueError(f"{path}.office: one of {', '.join(GAP_OFFICES)}")
        if not isinstance(e.get("describes_fy"), int) or isinstance(e["describes_fy"], bool):
            raise ValueError(f"{path}.describes_fy: int required")
        for k in ("doc_label", "counts"):
            _text(e.get(k), f"{path}.{k}")
        _need_value(e.get("value_m"), f"{path}.value_m")
        if e.get("value2_m") is not None:
            _need_value(e["value2_m"], f"{path}.value2_m")
    # Ruling R15: each office's latest entry for the coming year is the headline figure, not a second copy of it.
    for office, k in (("City", "city_m"), ("IBA", "iba_m")):
        mine = [e for e in tl if e["office"] == office and e["describes_fy"] == c["fy"]]
        if mine and max(mine, key=lambda e: e["date"])["value_m"] != c[k]:
            raise ValueError(f"timeline: the latest {office} entry for FY{c['fy']} must equal headlines.coming.{k}")
    return d


PILES_SUM_TOLERANCE_M = 0.01  # the Outlook's tables are printed to the dollar; its asset gaps add to Table 23 within $1
PILES_SHORTFALL_TOLERANCE_M = 1.0
PILES_PAYER_TOLERANCE_M = 0.001
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _figs(sec: dict, path: str, keys) -> dict:
    return {k: _need_value(sec.get(k), f"{path}.{k}") for k in keys}


def _obj(v, path: str) -> dict:
    if not isinstance(v, dict):
        raise ValueError(f"{path}: object required")
    return v


def build_piles_up(d: dict) -> dict:
    """Section 4 figures. Checks: the reserve is unaudited and below its target, and the target below the goal;
    the asset gaps add up to the Outlook's total (within $1M) and needs - funding = gap; the year-on-year growth is
    labeled our arithmetic and equals gap - prior_gap; the five payers add up to the Table 8 ADC; shortfall =
    liability - assets (within $1M); dates are YYYY-MM-DD; every example, process step and cite is complete."""
    d = copy.deepcopy(d)
    curated._walk(d, "")
    r = _obj(d.get("reserves"), "reserves")
    rv = _figs(r, "reserves", ("balance_m", "balance_pct", "target_m", "target_pct", "goal_pct", "draw_m", "skipped_m", "years_to_goal"))
    if r.get("unaudited") is not True:
        raise ValueError("reserves.unaudited: must be true (the FY2026 year-end figures are unaudited until the ACFR)")
    if not isinstance(r.get("goal_fy"), int) or isinstance(r["goal_fy"], bool):
        raise ValueError("reserves.goal_fy: int required")
    if not (rv["balance_m"] < rv["target_m"] and rv["balance_pct"] < rv["target_pct"] < rv["goal_pct"]):
        raise ValueError("reserves: expected balance < target < goal")

    i = _obj(d.get("infrastructure"), "infrastructure")
    iv = _figs(i, "infrastructure", ("gap_m", "needs_m", "funding_m", "prior_gap_m", "growth_m", "score_points"))
    if abs(iv["needs_m"] - iv["funding_m"] - iv["gap_m"]) > PILES_SUM_TOLERANCE_M:
        raise ValueError("infrastructure.gap_m: must equal needs_m - funding_m")
    _ours(i["growth_m"], "infrastructure.growth_m", True)
    if abs(iv["gap_m"] - iv["prior_gap_m"] - iv["growth_m"]) > GAP_TOLERANCE_M:
        raise ValueError("infrastructure.growth_m: must equal gap_m - prior_gap_m")
    assets = i.get("by_asset")
    if not isinstance(assets, list) or len(assets) < 9:
        raise ValueError("infrastructure.by_asset: the full asset table is required")
    names = set()
    for j, a in enumerate(assets):
        path = f"infrastructure.by_asset[{j}]"
        name = _text(a.get("asset") if isinstance(a, dict) else None, f"{path}.asset")
        if name in names:
            raise ValueError(f"{path}.asset: duplicate {name!r}")
        names.add(name)
        if _need_value(a.get("gap_m"), f"{path}.gap_m") < 0:
            raise ValueError(f"{path}.gap_m: negative")
        _ours(a["gap_m"], f"{path}.gap_m", False)
    total = sum(a["gap_m"]["value"] for a in assets)
    if abs(total - iv["gap_m"]) > PILES_SUM_TOLERANCE_M:
        raise ValueError(f"infrastructure.by_asset: sum {total:.1f} differs from gap_m {iv['gap_m']:.1f}")
    rd = _obj(i.get("roads"), "infrastructure.roads")
    _figs(rd, "infrastructure.roads", ("pci_2016", "pci_2023", "poor_share_pct", "funding_share_pct", "goal_old", "goal_new", "pci_2027", "pci_2036"))
    _text(rd.get("poor_share_text"), "infrastructure.roads.poor_share_text")
    ex = i.get("examples")
    if not isinstance(ex, list) or not ex:
        raise ValueError("infrastructure.examples: non-empty list required")
    for j, e in enumerate(ex):
        for k in ("name", "note"):
            _text(e.get(k) if isinstance(e, dict) else None, f"infrastructure.examples[{j}].{k}")
        _need_value(e.get("amount_m"), f"infrastructure.examples[{j}].amount_m")
    f = _obj(i.get("funded"), "infrastructure.funded")
    _figs(f, "infrastructure.funded", ("cip_m", "water_sewer_pct", "water_main_m", "sewer_main_m"))
    _ours(f["water_sewer_pct"], "infrastructure.funded.water_sewer_pct", True)
    steps = i.get("process")
    if not isinstance(steps, list) or not steps:
        raise ValueError("infrastructure.process: non-empty list required")
    for j, st in enumerate(steps):
        for k in ("step", "text"):
            _text(st.get(k) if isinstance(st, dict) else None, f"infrastructure.process[{j}].{k}")
        _check_source(st.get("source"), f"infrastructure.process[{j}].source")

    p = _obj(d.get("pension"), "pension")
    pv = _figs(p, "pension", ("liability_m", "assets_m", "shortfall_m", "funded_pct", "market_funded_pct", "adc_total_m",
                              "gf_share_pct", "rise_m", "fy2028_m", "fy2029_m"))
    if abs(pv["liability_m"] - pv["assets_m"] - pv["shortfall_m"]) > PILES_SHORTFALL_TOLERANCE_M:
        raise ValueError("pension.shortfall_m: must equal liability_m - assets_m")
    for k in ("valuation_date", "full_funding_valuation"):
        if not isinstance(p.get(k), str) or not _DATE.fullmatch(p[k]):
            raise ValueError(f"pension.{k}: date (YYYY-MM-DD) required")
    payers = p.get("payers")
    if not isinstance(payers, list) or len(payers) != 5:
        raise ValueError("pension.payers: the five Table 8 fund types are required")
    labels = set()
    for j, x in enumerate(payers):
        label = _text(x.get("label") if isinstance(x, dict) else None, f"pension.payers[{j}].label")
        if label in labels:
            raise ValueError(f"pension.payers[{j}].label: duplicate {label!r}")
        labels.add(label)
        if _need_value(x.get("amount_m"), f"pension.payers[{j}].amount_m") <= 0:
            raise ValueError(f"pension.payers[{j}].amount_m: must be positive")
    paid = sum(x["amount_m"]["value"] for x in payers)
    if abs(paid - pv["adc_total_m"]) > PILES_PAYER_TOLERANCE_M:
        raise ValueError(f"pension.payers: sum {paid:.6f} differs from adc_total_m {pv['adc_total_m']}")

    cites = d.get("cites")
    if not isinstance(cites, dict) or not cites:
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
    gap_story = build_gap_story(curated.load(curated_dir, "gap_story"))
    steps = [
        ("series", lambda: series),
        ("headline", lambda: curated.load(curated_dir, "headline")),
        ("funnel", lambda: curated.load(curated_dir, "funnel")),
        ("cuts", lambda: build_cuts(curated.load(curated_dir, "cuts"))),
        ("flows", lambda: build_flows(curated.load(curated_dir, "flows"))),
        ("structural_deficit", lambda: build_structural_deficit(
            curated.load(curated_dir, "structural_deficit"), series, coming=gap_story["headlines"]["coming"])),
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
        ("gap_story", lambda: gap_story),
        ("piles_up", lambda: share_urls(build_piles_up(curated.load(curated_dir, "piles_up")))),
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
