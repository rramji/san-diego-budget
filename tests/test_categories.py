import pytest
from pipeline.categories import expense_category, revenue_category, EXPENSE_CATEGORIES

def r(group, account="x", typ="Personnel"):
    return {"account_type": typ, "account_group": group, "account": account}

@pytest.mark.parametrize("row,cat", [
    (r("Special Pays", "Overtime Budgeted"), "Overtime"),
    (r("Special Pays", "2nd Watch Shift"), "Salaries & other pay"),
    (r("Salaries", "Salaried Wages"), "Salaries & other pay"),
    (r("Other Personnel Expenditures", "Vacancy Factor"), "Salaries & other pay"),
    (r("Retirement ADC", "CERS - General Retirement"), "Pension payment"),
    (r("Employee Offset Savings", "CERS-UAAL Police Active"), "Pension payment"),
    (r("Workers' Compensation"), "Workers' comp"),
    (r("Flexible Benefits"), "Health & other benefits"),
    (r("Supplemental Pension Savings Plan"), "Health & other benefits"),
    (r("Internal Contracts & Services", "Equipment Rental - Motive Usage", "Non-Personnel"), "Vehicles"),
    (r("Energy and Utilities", "Fleet Fuel (Non-Discretionary)", "Non-Personnel"), "Vehicles"),
    (r("External Contracts & Services", "Consultant", "Non-Personnel"), "Contracts & services"),
    (r("IT Group 3", typ="Non-Personnel"), "Information technology"),
    (r("Debt", typ="Non-Personnel"), "Debt payments"),
    (r("Transfers Out", typ="Non-Personnel"), "Transfers to other funds"),
    (r("Capital Expenditures", "Cap Exp-Building Improvement", "Non-Personnel"), "Equipment & construction"),
    (r("Contingencies", typ="Non-Personnel"), "Other costs"),
    (r("Something New", typ="Non-Personnel"), "Other costs"),
    # Ruling R5: non-vehicle internal contracts are plain contracts and services.
    (r("Internal Contracts & Services", "Information Technology Services", "Non-Personnel"), "Contracts & services"),
    (r("Supplies", typ="Non-Personnel"), "Supplies"),
    (r("Energy and Utilities", "Electricity", "Non-Personnel"), "Energy & utilities"),
    (r("IT Group 1", typ="Non-Personnel"), "Information technology"),
    (r("Capital Expenditures", "Cap Exp-Vehicles", "Non-Personnel"), "Vehicles"),
])
def test_expense_category(row, cat):
    assert expense_category(row) == cat
    assert cat in EXPENSE_CATEGORIES

def test_category_list_is_fourteen_in_display_order():
    assert EXPENSE_CATEGORIES == (
        "Salaries & other pay", "Overtime", "Pension payment", "Workers' comp",
        "Health & other benefits", "Vehicles", "Contracts & services", "Supplies",
        "Energy & utilities", "Information technology", "Debt payments",
        "Transfers to other funds", "Equipment & construction", "Other costs",
    )

def test_revenue_category_is_account_type():
    assert revenue_category({"account_type": "Sales Taxes"}) == "Sales Taxes"

def test_loader_carries_account_group():
    from pipeline.csv_loader import load_budget_rows, latest_detail_fy
    from pathlib import Path
    rows = load_budget_rows(Path(__file__).parent / "fixtures")
    assert {r["account_group"] for r in rows} >= {"Salaries", "Supplies"}
    assert latest_detail_fy(rows) == 2026

def test_latest_detail_fy_moves_when_fy2027_appears():
    from pipeline.csv_loader import latest_detail_fy
    base = {"cycle": "adopted", "fund_type": "General Fund", "account_type": "Personnel", "amount": 1.0}
    assert latest_detail_fy([{**base, "fy": 2026, "cycle": ""}, {**base, "fy": 2027}]) == 2027
    assert latest_detail_fy([{**base, "fy": 2026, "cycle": ""}, {**base, "fy": 2027, "cycle": "proposed"}]) == 2026
