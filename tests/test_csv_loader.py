from pathlib import Path

import pytest

from pipeline.csv_loader import (
    gf_by_dept,
    gf_totals_by_fy,
    load_budget_rows,
    select_cycle,
)

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def rows():
    return load_budget_rows(FIX)


def test_unmatched_account_dropped(capsys):
    rows = load_budget_rows(FIX)
    assert len(rows) == 9
    assert all(r["account_number"] != "999999" for r in rows)
    assert all(isinstance(r["fy"], int) and r["fy"] >= 2000 for r in rows)
    assert "dropped 1 rows" in capsys.readouterr().err


def test_select_cycle_prefers_adopted_and_accepts_blank(rows):
    sel = select_cycle(rows)
    fy25 = [r for r in sel if r["fy"] == 2025]
    assert sum(r["amount"] for r in fy25) == 200
    fy26 = [r for r in sel if r["fy"] == 2026]
    assert [r["amount"] for r in fy26] == [300]


def test_gf_totals_split_revenue_and_expense(rows):
    t = gf_totals_by_fy(select_cycle(rows))
    assert t[2023]["expense_m"] == pytest.approx(150e-6)
    assert t[2023]["revenue_m"] == pytest.approx(150e-6)
    assert t[2023]["by_account_type"]["Property Tax Revenue"] == pytest.approx(120e-6)


def test_gf_by_dept_excludes_major_revenues(rows):
    out = gf_by_dept(select_cycle(rows), 2023)
    assert out == [("Police", pytest.approx(150e-6))]
