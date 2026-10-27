import json

import pytest

from pipeline import checks


def _write(d, name, obj):
    (d / f"{name}.json").write_text(json.dumps(obj))


@pytest.fixture
def out(tmp_path):
    _write(tmp_path, "series", {
        "gf_by_fy": {"2026": {"revenue_m": 2167.4, "expense_m": 2167.4,
                              "by_account_type": {"Property Tax Revenue": 844.6}}},
        "vintage": {"fetched_at": "2026-10-24T00:00:00+00:00", "sha256": {"a": "x"}},
    })
    _write(tmp_path, "headline", {"general_fund_m": {"value": 100.0}})
    _write(tmp_path, "funnel", {"bar4": [{"amount_m": {"value": 60.0}},
                                         {"amount_m": {"value": 40.0}}]})
    _write(tmp_path, "budget_tree", _tree())
    return tmp_path


def _node(name, value, fy=2026, children=None, offsets=None):
    return {"name": name, "key": name, "value_m": value, "fy": fy, "src": "s0",
            "children": children, "offsets": offsets}


def _tree():
    out = _node("Utilities money out", 65.0, children=[
        _node("Salaries & other pay", 70.0, children=[_node("Salaried Wages", 100.0)],
              offsets=[{"name": "Vacancy Factor", "value_m": -30.0}])],
        offsets=[{"name": "Other costs", "value_m": -5.0}])
    gf_in = _node("General Fund money in", 100.0, fy=2027, children=[
        _node("Property Tax", 100.5, fy=2027, children=[_node("Secured Property Tax", 80.0)])])
    return {"bar_fy": 2027, "detail_fy": 2026, "sources": {"s0": {}}, "pots": [
        {"id": "general_fund", "in": gf_in, "out": _node("General Fund money out", 0.0, fy=2027)},
        {"id": "utilities", "in": _node("Utilities money in", 0.0), "out": out}]}


def _edit(out, name, fn):
    p = out / f"{name}.json"
    d = json.loads(p.read_text())
    fn(d)
    p.write_text(json.dumps(d))


def test_valid_output_passes(out):
    assert checks.run(out) == []


def test_edge_of_tolerance_passes(out):
    _edit(out, "series", lambda d: d["gf_by_fy"]["2026"].update(revenue_m=2167.4 * 0.991))
    assert checks.run(out) == []


def test_revenue_flagged(out):
    _edit(out, "series", lambda d: d["gf_by_fy"]["2026"].update(revenue_m=2100))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "revenue" in msgs[0]


def test_property_tax_flagged(out):
    _edit(out, "series", lambda d: d["gf_by_fy"]["2026"]["by_account_type"].update(
        {"Property Tax Revenue": 800}))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "property tax" in msgs[0]


def test_bar4_flagged(out):
    _edit(out, "funnel", lambda d: d["bar4"][0]["amount_m"].update(value=61.0))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "bar4" in msgs[0]


def test_bar4_within_tolerance_passes(out):
    _edit(out, "funnel", lambda d: d["bar4"][0]["amount_m"].update(value=60.4))
    assert checks.run(out) == []


@pytest.mark.parametrize("vintage", [
    {"fetched_at": None, "sha256": {}},
    {"fetched_at": "2026-10-24", "sha256": {}},
    {"fetched_at": None, "sha256": {"a": "x"}},
])
def test_empty_vintage_flagged(out, vintage):
    _edit(out, "series", lambda d: d.update(vintage=vintage))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "vintage" in msgs[0]


def test_size_flagged_and_negative_case(out):
    assert checks.run(out) == []
    (out / "big.json").write_text("x" * 301_000)
    msgs = checks.run(out)
    assert len(msgs) == 1 and "300" in msgs[0]


def test_missing_file_reported(out):
    (out / "funnel.json").unlink()
    msgs = checks.run(out)
    assert len(msgs) == 1 and "funnel" in msgs[0]


def test_budget_tree_size_flagged(out):
    (out / "budget_tree.json").write_text(json.dumps(_tree()) + " " * 130_000)
    msgs = checks.run(out)
    assert len(msgs) == 1 and "budget_tree.json" in msgs[0] and "130,000" in msgs[0]


def test_budget_tree_same_year_children_must_sum_to_parent(out):
    # Salaries: account 100 + offset -30 = 70 matches; a 2% miss on the account is flagged
    _edit(out, "budget_tree", lambda d: d["pots"][1]["out"]["children"][0]["children"][0].update(value_m=101.5))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "Salaries & other pay" in msgs[0] and "71.500" in msgs[0]


def test_budget_tree_different_year_children_not_checked(out):
    # FY2027 Property Tax (100.5) has FY2026 account detail (80.0): detail, not a sum
    assert checks.run(out) == []
    _edit(out, "budget_tree", lambda d: d["pots"][0]["in"].update(value_m=200.0))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "General Fund money in" in msgs[0]


def test_budget_tree_missing_reported(out):
    (out / "budget_tree.json").unlink()
    msgs = checks.run(out)
    assert len(msgs) == 1 and "budget_tree" in msgs[0]
