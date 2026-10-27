"""Load San Diego budget CSVs and compute General Fund aggregates."""
import csv
import sys
from collections import defaultdict
from pathlib import Path

EXPENSE_TYPES = {"Personnel", "Non-Personnel"}


def _fy(value: str) -> int:
    return 2000 + int(value)


def _read_budget(raw_dir: Path) -> tuple[list[dict], list[dict]]:
    """Operating-budget rows split into (matched, unmatched): unmatched rows have an account
    number that is missing from ref_accounts.csv, so their account type is unknown."""
    raw_dir = Path(raw_dir)
    with open(raw_dir / "ref_accounts.csv", newline="", encoding="utf-8") as f:
        accounts = {
            r["account_number"]: (r["account_type"], r["account_group"])
            for r in csv.DictReader(f)
        }
    rows, unmatched = [], []
    with open(raw_dir / "operating_budget.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            base = {
                "fy": _fy(r["report_fy"]),
                "cycle": r["budget_cycle"],
                "fund_type": r["fund_type"],
                "fund_number": r["fund_number"],
                "dept_name": r["dept_name"],
                "funds_center_number": r["funds_center_number"],
                "account": r["account"],
                "account_number": r["account_number"],
            }
            amount = float(r["amount"] or 0)
            acct = accounts.get(r["account_number"])
            if acct is None:
                unmatched.append({**base, "amount": amount})
                continue
            acct_type, acct_group = acct
            rows.append({**base, "account_type": acct_type, "account_group": acct_group, "amount": amount})
    return rows, unmatched


def load_budget_rows(raw_dir: Path) -> list[dict]:
    rows, dropped = _read_budget(raw_dir)
    if dropped:
        print(
            f"csv_loader: dropped {len(dropped)} rows (total ${sum(r['amount'] for r in dropped):,.0f}) "
            "with account numbers not in reference",
            file=sys.stderr,
        )
    return rows


def unmatched_rows(raw_dir: Path) -> list[dict]:
    """The rows load_budget_rows drops: account number not in ref_accounts.csv (all fiscal years)."""
    return _read_budget(raw_dir)[1]


def load_fund_names(raw_dir: Path) -> dict[str, str]:
    """fund_number -> fund_name from ref_funds.csv."""
    with open(Path(raw_dir) / "ref_funds.csv", newline="", encoding="utf-8") as f:
        return {r["fund_number"]: r["fund_name"] for r in csv.DictReader(f)}


def select_cycle(rows: list[dict]) -> list[dict]:
    """Per FY keep adopted rows if any, else blank-cycle rows; never proposed."""
    has_adopted = {r["fy"] for r in rows if r["cycle"] == "adopted"}
    return [
        r for r in rows
        if (r["cycle"] == "adopted" if r["fy"] in has_adopted else r["cycle"] == "")
    ]


def latest_detail_fy(rows: list[dict]) -> int:
    """Latest fiscal year that has General Fund spending rows, after select_cycle."""
    return max(
        r["fy"]
        for r in select_cycle(rows)
        if r["fund_type"] == "General Fund" and r["account_type"] in EXPENSE_TYPES
    )


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
