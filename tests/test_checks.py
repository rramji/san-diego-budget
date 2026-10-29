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
    descs = {k: {"text": f"{k} text.", "src": "s0", "link": None}
             for k in ("Property Tax", "Salaries & other pay", "_no_fund")}
    return {"bar_fy": 2027, "detail_fy": 2026, "sources": {"s0": {}}, "descs": descs, "pots": [
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


def test_total_size_not_capped(out):
    (out / "big.json").write_text("x" * 301_000)
    assert checks.run(out) == []


def test_missing_file_reported(out):
    (out / "funnel.json").unlink()
    msgs = checks.run(out)
    assert len(msgs) == 1 and "funnel" in msgs[0]


def test_budget_tree_size_flagged(out):
    (out / "budget_tree.json").write_text(json.dumps(_tree()) + " " * 130_000)
    assert checks.run(out) == []  # the tree alone is capped at 150,000
    (out / "budget_tree.json").write_text(json.dumps(_tree()) + " " * 150_000)
    msgs = checks.run(out)
    assert any("budget_tree.json" in m and "150,000" in m for m in msgs)


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


def test_budget_tree_level1_children_need_descriptions(out):
    _edit(out, "budget_tree", lambda d: d["descs"].pop("Property Tax"))
    _edit(out, "budget_tree", lambda d: d["descs"]["Salaries & other pay"].update(text=" "))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "descs" in msgs[0]
    assert "Property Tax" in msgs[0] and "Salaries & other pay" in msgs[0]


def test_budget_tree_no_fund_description_required(out):
    _edit(out, "budget_tree", lambda d: d["descs"].pop("_no_fund"))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "_no_fund" in msgs[0]


def test_budget_tree_deeper_nodes_need_no_description(out):
    # "Secured Property Tax" (level 2) and "Salaried Wages" (level 2) have no descs entry
    assert checks.run(out) == []


@pytest.mark.parametrize("name", ["", "  "])
def test_budget_tree_blank_name_flagged(out, name):
    _edit(out, "budget_tree", lambda d: d["pots"][1]["out"]["children"][0]["children"][0].update(name=name))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "blank name" in msgs[0] and "Salaries & other pay" in msgs[0]


@pytest.mark.parametrize("value", [0.0, -1.0])
def test_budget_tree_child_not_positive_flagged(out, value):
    def edit(d):
        sal = d["pots"][1]["out"]["children"][0]
        sal["children"].append(_node("Odd line", value))
        sal["offsets"][0]["value_m"] -= value  # keep the sum check quiet: only the drawn-child rule should fire
    _edit(out, "budget_tree", edit)
    msgs = checks.run(out)
    assert len(msgs) == 1 and "Odd line" in msgs[0] and "not positive" in msgs[0]


def test_budget_tree_unused_source_flagged(out):
    _edit(out, "budget_tree", lambda d: d["sources"].update(s9={"doc": "x", "page": None, "url": "https://x"}))
    msgs = checks.run(out)
    assert len(msgs) == 1 and "s9" in msgs[0] and "unused" in msgs[0]


@pytest.mark.parametrize("pot, side", [("cip", "in"), ("cip", "out"), ("internal", "out")])
def test_budget_tree_cip_and_internal_top_level_need_descriptions(out, pot, side):
    def edit(d):
        root = _node(f"{pot} money {side}", 5.0, fy=2027, children=[_node("Mystery Fund", 5.0, fy=2027)])
        d["pots"].append({"id": pot, "in": _node("x in", 0.0), "out": _node("x out", 0.0), side: root})
    _edit(out, "budget_tree", edit)
    msgs = checks.run(out)
    assert len(msgs) == 1 and "descs" in msgs[0] and "Mystery Fund" in msgs[0]
    _edit(out, "budget_tree", lambda d: d["descs"].update({"Mystery Fund": {"text": "A fund.", "src": "s0"}}))
    assert checks.run(out) == []


def test_real_budget_tree_passes_the_new_rules():
    from pathlib import Path
    real = Path(__file__).parent.parent / "data" / "build"
    failures = []
    checks.check_budget_tree(real, failures)
    assert failures == []
