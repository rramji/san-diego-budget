"""Load San Diego budget CSVs and compute General Fund aggregates."""
import csv
import sys
from collections import defaultdict
from pathlib import Path

EXPENSE_TYPES = {"Personnel", "Non-Personnel"}


def _fy(value: str) -> int:
    return 2000 + int(value)


def load_budget_rows(raw_dir: Path) -> list[dict]:
    raw_dir = Path(raw_dir)
    with open(raw_dir / "ref_accounts.csv", newline="", encoding="utf-8") as f:
        types = {r["account_number"]: r["account_type"] for r in csv.DictReader(f)}
    rows = []
    dropped = 0
    dropped_total = 0.0
    with open(raw_dir / "operating_budget.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            amount = float(r["amount"] or 0)
            acct_type = types.get(r["account_number"])
            if acct_type is None:
                dropped += 1
                dropped_total += amount
                continue
            rows.append({
                "fy": _fy(r["report_fy"]),
                "cycle": r["budget_cycle"],
                "fund_type": r["fund_type"],
                "fund_number": r["fund_number"],
                "dept_name": r["dept_name"],
                "funds_center_number": r["funds_center_number"],
                "account": r["account"],
                "account_number": r["account_number"],
                "account_type": acct_type,
                "amount": amount,
            })
    if dropped:
        print(
            f"csv_loader: dropped {dropped} rows (total ${dropped_total:,.0f}) "
            "with account numbers not in reference",
            file=sys.stderr,
        )
    return rows


def select_cycle(rows: list[dict]) -> list[dict]:
    """Per FY keep adopted rows if any, else blank-cycle rows; never proposed."""
    has_adopted = {r["fy"] for r in rows if r["cycle"] == "adopted"}
    return [
        r for r in rows
        if (r["cycle"] == "adopted" if r["fy"] in has_adopted else r["cycle"] == "")
    ]


def gf_totals_by_fy(rows: list[dict]) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for r in rows:
        if r["fund_type"] != "General Fund":
            continue
        t = out.setdefault(
            r["fy"], {"revenue_m": 0.0, "expense_m": 0.0, "by_account_type": defaultdict(float)}
        )
        m = r["amount"] / 1e6
        key = "expense_m" if r["account_type"] in EXPENSE_TYPES else "revenue_m"
        t[key] += m
        t["by_account_type"][r["account_type"]] += m
    for t in out.values():
        t["by_account_type"] = dict(t["by_account_type"])
    return out


def gf_by_dept(rows: list[dict], fy: int) -> list[tuple[str, float]]:
    totals: dict[str, float] = defaultdict(float)
    for r in rows:
        if (
            r["fy"] == fy
            and r["fund_type"] == "General Fund"
            and r["account_type"] in EXPENSE_TYPES
            and r["dept_name"] != "Major Revenues"
        ):
            totals[r["dept_name"]] += r["amount"] / 1e6
    return sorted(totals.items(), key=lambda kv: kv[1], reverse=True)


def load_cip_rows(raw_dir: Path) -> list[dict]:
    with open(Path(raw_dir) / "cip_budget.csv", newline="", encoding="utf-8") as f:
        return [
            {
                "fy": _fy(r["report_fy"]),
                "cycle": r["budget_cycle"],
                "fund_type": r["fund_type"],
                "fund_number": r["fund_number"],
                "dept": r["asset_owning_dept"],
                "project_number": r["project_number"],
                "project_name": r["project_name"],
                "account": r["account"],
                "amount": float(r["amount"] or 0),
            }
            for r in csv.DictReader(f)
        ]
