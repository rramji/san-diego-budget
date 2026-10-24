"""Assemble the published JSON files in data/build/ from raw CSVs and curated figures."""
import json
import sys
from pathlib import Path

from pipeline import curated
from pipeline.csv_loader import (
    gf_by_dept,
    gf_totals_by_fy,
    load_budget_rows,
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
    for e in sorted(entries, key=lambda e: e["fy"]):
        fy_totals = gf.get(str(e["fy"])) or gf.get(e["fy"])
        years.append({**e, "gf_expenditure_adopted_m": fy_totals["expense_m"] if fy_totals else None})
    return {"convention": DEFICIT_CONVENTION, "years": years, "markers": DEFICIT_MARKERS}


def build_all(raw_dir: Path, curated_dir: Path, out_dir: Path) -> list[Path]:
    """Write every published file. To add a file, append one (name, fn) to steps."""
    raw_dir, curated_dir, out_dir = Path(raw_dir), Path(curated_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = load_budget_rows(raw_dir)
    series = build_series(rows, _vintage(raw_dir))
    steps = [
        ("series", lambda: series),
        ("headline", lambda: curated.load(curated_dir, "headline")),
        ("funnel", lambda: curated.load(curated_dir, "funnel")),
        ("structural_deficit", lambda: build_structural_deficit(
            curated.load(curated_dir, "structural_deficit"), series)),
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
