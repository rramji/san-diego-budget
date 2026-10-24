"""Assemble the published JSON files in data/build/ from raw CSVs and curated figures."""
import json
import sys
from pathlib import Path

from pipeline import curated
from pipeline.bike_match import is_bike_project, is_road_repair
from pipeline.csv_loader import (
    gf_by_dept,
    gf_totals_by_fy,
    load_budget_rows,
    load_cip_rows,
    select_cycle,
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
KPBS_2026_06_09 = (
    "https://www.kpbs.org/news/politics/2026/06/09/"
    "san-diego-city-council-looks-to-close-15-3-million-gap-going-into-tuesdays-budget-vote"
)
DEFICIT_MARKERS = [
    {"fy": 2011, "label": "Nov 2010: half-cent sales tax (Prop D) fails"},
    {"fy": 2025, "label": "Nov 2024: one-cent sales tax (Measure E) fails"},
    {"fy": 2026, "label": "Trash fee adopted with FY2026 budget"},
    {
        "fy": 2028,
        "label": "IBA projects ~$30M gap",
        "source": {
            "value": 30,
            "source": {
                "doc": "KPBS, 2026-06-09: the structural deficit 'will grow to around $30 million next year, according to' IBA Charles Modica",
                "page": None,
                "url": KPBS_2026_06_09,
            },
        },
    },
]


def build_structural_deficit(entries: list[dict], series: dict) -> dict:
    """Curated per-FY structural deficit entries, each with that FY's adopted GF expense merged in."""
    gf = series["gf_by_fy"]
    years = []
    for i, e in enumerate(entries):
        if not isinstance(e.get("basis"), str) or not e["basis"].strip():
            raise ValueError(f"[{i}].basis: required non-empty string")
        if not isinstance(e.get("resources_include_reserve"), bool):
            raise ValueError(f"[{i}].resources_include_reserve: required boolean")
    for e in sorted(entries, key=lambda e: e["fy"]):
        fy_totals = gf.get(str(e["fy"])) or gf.get(e["fy"])
        years.append({**e, "gf_expenditure_adopted_m": fy_totals["expense_m"] if fy_totals else None})
    return {"convention": DEFICIT_CONVENTION, "years": years, "markers": DEFICIT_MARKERS}


def _check_source(src, path: str) -> None:
    """Validate a bare Source (no value) with the same rules as a Figure's source."""
    if not isinstance(src, dict):
        raise ValueError(f"{path}: missing source")
    curated.validate_figure({"value": 0, "source": src}, path)


def build_flows(flows: dict) -> dict:
    """Validate the money-flow graph: unique node ids, no dangling links, sourced refs, one highlight."""
    ids = [n["id"] for n in flows["nodes"]]
    for i in {x for x in ids if ids.count(x) > 1}:
        raise ValueError(f"nodes: duplicate id {i!r}")
    known = set(ids)
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


def _homelessness_chart(series: dict) -> dict:
    points = []
    for fy in sorted(series["gf_dept_by_fy"], key=int):
        amount = sum(a for d, a in series["gf_dept_by_fy"][fy] if "Homelessness" in d)
        has_dept = any("Homelessness" in d for d, _ in series["gf_dept_by_fy"][fy])
        total = (series["gf_by_fy"].get(fy) or {}).get("expense_m")
        if has_dept and total:
            points.append({"fy": int(fy), "amount_m": amount, "share_pct": amount / total * 100})
    return {"type": "line", "points": points}


def build_claims(curated_claims: list[dict], cip_rows: list[dict], series: dict) -> list[dict]:
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
            card["chart"] = _homelessness_chart(series)
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


def build_all(raw_dir: Path, curated_dir: Path, out_dir: Path) -> list[Path]:
    """Write every published file. To add a file, append one (name, fn) to steps."""
    raw_dir, curated_dir, out_dir = Path(raw_dir), Path(curated_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
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
        ("claims", lambda: build_claims(curated.load(curated_dir, "claims"), cip_rows, series)),
        ("glossary", lambda: build_glossary(curated.load(curated_dir, "glossary"))),
    ]
    return [_write(out_dir, name, fn()) for name, fn in steps]


def main() -> int:
    from pipeline import checks

    root = Path(__file__).resolve().parent.parent
    out_dir = root / "data" / "build"
    build_all(root / "data" / "raw", root / "data" / "curated", out_dir)
    failures = checks.run(out_dir)
    for msg in failures:
        print(f"CHECK FAILED: {msg}", file=sys.stderr)
    if failures:
        return 1
    print(f"build ok: {out_dir}")
    return 0
