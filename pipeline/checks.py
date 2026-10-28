"""Assertions on the built output against published figures. Only checks; builds nothing."""
import json
from pathlib import Path

# Published FY2026 General Fund figures (millions) and the allowed relative drift.
# Observed with the 2026-10-24 CSV vintage: revenue_m ~2148.1 (-0.9%), property tax ~843.4.
# If a future vintage drifts past 1%, investigate the cause; do not loosen the tolerance.
GF_REVENUE_FY2026_M = 2167.4
PROPERTY_TAX_FY2026_M = 844.6
TOLERANCE = 0.01
BAR4_TOLERANCE_M = 0.5
MAX_BYTES = 300_000
TREE_MAX_BYTES = 150_000  # ruling R16 (R11 fallback): plan-only sub-limit; the spec's binding cap is MAX_BYTES
TREE_SUM_TOLERANCE = 0.01      # same-year children (plus offsets) vs. their parent
TREE_ROUNDING_SLACK_M = 0.0005  # per summed value: build output is rounded to 3 decimals
# Boxes that must have a description (descs[key]): the top level of these maps, plus the no-fund box (ruling R16
# adds Construction projects in/out and Internal services out). Deeper boxes may go without one (the panel shows the
# amount and its category context).
DESC_REQUIRED = {"general_fund": ("in", "out"), "utilities": ("out",), "purpose": ("out",),
                 "cip": ("in", "out"), "internal": ("out",)}
DESC_ALWAYS = ("_no_fund",)


def _load(out_dir: Path, name: str) -> dict:
    return json.loads((out_dir / f"{name}.json").read_text(encoding="utf-8"))


def _within(actual: float, expected: float, label: str, failures: list[str]) -> None:
    if abs(actual - expected) > TOLERANCE * expected:
        failures.append(
            f"{label} = {actual:.1f} not within {TOLERANCE:.0%} of published {expected}"
        )


def _tree_nodes(tree: dict):
    """(path, node) for every node of every map, roots included."""
    stack = [(p[side]["name"], p[side]) for p in tree["pots"] for side in ("in", "out")]
    while stack:
        path, n = stack.pop()
        yield path, n
        stack.extend((f"{path} > {c['name']}", c) for c in n.get("children") or [])


def _check_descs(tree: dict, failures: list[str]) -> None:
    descs = tree.get("descs") or {}

    def has(key):
        return bool(str((descs.get(key) or {}).get("text") or "").strip())
    missing = []
    for p in tree["pots"]:
        for side in DESC_REQUIRED.get(p["id"], ()):
            root = p[side]
            missing += [f"{root['name']} > {c['name']} (key {c['key']!r})"
                        for c in root.get("children") or [] if not has(c["key"])]
    missing += [repr(k) for k in DESC_ALWAYS if not has(k)]
    if missing:
        failures.append(f"budget_tree descs missing for {len(missing)} item(s): " + "; ".join(missing))


def _used_sources(tree: dict) -> set:
    used = {n.get("src") for _, n in _tree_nodes(tree)} | {p.get("src") for p in tree["pots"]}
    used |= {a.get("src") for p in tree["pots"] for a in (p.get("answers") or {}).values()}
    used |= {d.get("src") for d in (tree.get("descs") or {}).values()}
    return used - {None}


def check_budget_tree(out_dir: Path, failures: list[str]) -> None:
    path = Path(out_dir) / "budget_tree.json"
    try:
        size = path.stat().st_size
        tree = json.loads(path.read_text(encoding="utf-8"))
        if size >= TREE_MAX_BYTES:
            failures.append(f"budget_tree.json size {size} bytes exceeds {TREE_MAX_BYTES:,} byte limit")
        for where, n in _tree_nodes(tree):
            # Review focus 1 and 2: no blank label is ever drawn, and no drawn box has a zero or negative area.
            if not str(n.get("name") or "").strip():
                failures.append(f"budget_tree {where}: blank name")
            for c in n.get("children") or []:
                if not c["value_m"] > 0:
                    failures.append(f"budget_tree {where} > {c['name']}: drawn child value {c['value_m']} is not positive")
            kids = n.get("children")
            # Children from a different year are detail (FY2026 lines under an FY2027 box), not a sum.
            if not kids or any(c["fy"] != n["fy"] for c in kids):
                continue
            parts = [c["value_m"] for c in kids] + [o["value_m"] for o in n.get("offsets") or []]
            s = sum(parts)
            if abs(s - n["value_m"]) > TREE_SUM_TOLERANCE * abs(n["value_m"]) + TREE_ROUNDING_SLACK_M * len(parts):
                failures.append(f"budget_tree {where}: children and offsets sum to {s:.3f}, "
                                f"not within {TREE_SUM_TOLERANCE:.0%} of {n['value_m']}")
        _check_descs(tree, failures)
        unused = sorted(set(tree.get("sources") or {}) - _used_sources(tree))
        if unused:
            failures.append(f"budget_tree sources unused by any node, answer or description: {', '.join(unused)}")
    except (OSError, KeyError, TypeError, ValueError) as e:
        failures.append(f"budget_tree.json check could not run: {e!r}")


def run(out_dir: Path) -> list[str]:
    out_dir = Path(out_dir)
    failures: list[str] = []
    try:
        fy26 = _load(out_dir, "series")["gf_by_fy"]["2026"]
        _within(fy26["revenue_m"], GF_REVENUE_FY2026_M, "FY2026 GF revenue_m", failures)
        _within(
            fy26["by_account_type"]["Property Tax Revenue"],
            PROPERTY_TAX_FY2026_M,
            "FY2026 property tax",
            failures,
        )
    except (OSError, KeyError, ValueError) as e:
        failures.append(f"series.json FY2026 check could not run: {e!r}")
    try:
        gf = _load(out_dir, "headline")["general_fund_m"]["value"]
        bar4 = sum(b["amount_m"]["value"] for b in _load(out_dir, "funnel")["bar4"])
        if abs(bar4 - gf) > BAR4_TOLERANCE_M:
            failures.append(
                f"funnel bar4 sum {bar4:.1f} differs from headline general_fund_m {gf} by more than {BAR4_TOLERANCE_M}"
            )
    except (OSError, KeyError, ValueError) as e:
        failures.append(f"funnel/headline check could not run: {e!r}")
    try:
        vintage = _load(out_dir, "series")["vintage"]
        if not vintage.get("fetched_at") or not vintage.get("sha256"):
            failures.append("series.json vintage is empty (missing data/raw/manifest.json?)")
    except (OSError, KeyError, ValueError) as e:
        failures.append(f"series.json vintage check could not run: {e!r}")
    check_budget_tree(out_dir, failures)
    total = sum(p.stat().st_size for p in out_dir.glob("*.json"))
    if total >= MAX_BYTES:
        failures.append(f"data/build size {total} bytes exceeds 300,000 byte limit")
    return failures
