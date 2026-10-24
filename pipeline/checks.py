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


def _load(out_dir: Path, name: str) -> dict:
    return json.loads((out_dir / f"{name}.json").read_text(encoding="utf-8"))


def _within(actual: float, expected: float, label: str, failures: list[str]) -> None:
    if abs(actual - expected) > TOLERANCE * expected:
        failures.append(
            f"{label} = {actual:.1f} not within {TOLERANCE:.0%} of published {expected}"
        )


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
    total = sum(p.stat().st_size for p in out_dir.glob("*.json"))
    if total >= MAX_BYTES:
        failures.append(f"data/build size {total} bytes exceeds 300,000 byte limit")
    return failures
