from pathlib import Path
from types import SimpleNamespace

import pytest

from pipeline import curated
from pipeline.budget_tree import CSV_URL, MAX_CHILDREN, _gf_match, build_budget_tree
from pipeline.build import build_cip, build_gf_revenue

ROOT = Path(__file__).parent.parent
CUR = ROOT / "data" / "curated"
M = 1e6

FUND_NAMES = {
    "100000": "General Fund",
    "700000": "Water Fund",
    "700100": "Sewer Fund",
    "700200": "Pipe Fund",
    "600000": "Fleet Fund",
    "400000": "Capital Outlay Fund",
    **{f"2000{i:02d}": f"Purpose Fund {i}" for i in range(14)},
}


def row(fund_type, fund_number, dept, account, group, typ, amount_m, fy=2026, cycle="adopted"):
    return {"fy": fy, "cycle": cycle, "fund_type": fund_type, "fund_number": fund_number,
            "dept_name": dept, "account": account, "account_group": group,
            "account_type": typ, "amount": amount_m * M}


def gf_exp(dept, account, group, amount_m, typ="Personnel", **kw):
    return row("General Fund", "100000", dept, account, group, typ, amount_m, **kw)


def gf_rev(account, group, typ, amount_m, dept="Major Revenues", **kw):
    return row("General Fund", "100000", dept, account, group, typ, amount_m, **kw)


def synthetic_rows(fy=2026):
    rows = [
        # General Fund spending
        gf_exp("Police", "Salaried Wages", "Salaries", 300.0, fy=fy),
        gf_exp("Police", "Vacancy Factor", "Other Personnel Expenditures", -20.0, fy=fy),
        gf_exp("Police", "Overtime - Sworn", "Special Pays", 45.0, fy=fy),
        gf_exp("Police", "CERS - Saf Ret - Police", "Retirement ADC", 160.0, fy=fy),
        gf_exp("Fire-Rescue", "Salaried Wages", "Salaries", 200.0, fy=fy),
        gf_exp("Citywide Expenses", "Consultant", "External Contracts & Services", 150.0,
               typ="Non-Personnel", fy=fy),
        gf_exp("", "Salaried Wages", "Salaries", 19.6, fy=fy),
        gf_exp("Major Revenues", "Salaried Wages", "Salaries", 999.0, fy=fy),
        *[gf_exp(f"Small Dept {i}", "Salaried Wages", "Salaries", 1.0 + i, fy=fy) for i in range(14)],
        # General Fund revenue
        gf_rev("Secured Property Tax", "Property Taxes", "Property Tax Revenue", 800.0, fy=fy),
        gf_rev("Unsecured Property Tax", "Property Taxes", "Property Tax Revenue", 43.0, fy=fy),
        gf_rev("Property Tax Refunds", "Property Taxes", "Property Tax Revenue", -2.0, fy=fy),
        gf_rev("Sales Tax", "Sales Tax", "Sales Taxes", 367.0, fy=fy),
        gf_rev("Franchise Tax - SDG&E", "SDG&E", "Other Local Taxes", 66.3, fy=fy),
        gf_rev("Property Transfer Tax", "Property Transfer Tax", "Other Local Taxes", 11.0, fy=fy),
        gf_rev("Documentary Recording", "Property Transfer Tax", "Other Local Taxes", 0.5, fy=fy),
        gf_rev("Misc Revenue", "Other Revenue", "Other Revenue", 2.0, fy=fy),
        gf_rev("Lighting District Assessment", "Special Assessments", "Special Assessments", 0.4, fy=fy),
        *[gf_rev(f"Service Charge {i}", "Charges for Current Services", "Charges for Current Services",
                 5.0 + i, dept="Police", fy=fy) for i in range(25)],
        *[gf_rev(f"Tiny Charge {i}", "Charges for Current Services", "Charges for Current Services",
                 0.04, dept="Police", fy=fy) for i in range(10)],
        # Utilities: Water Fund (vacancy line and contingency credit)
        row("Enterprise Funds", "700000", "Public Utilities", "Salaried Wages", "Salaries", "Personnel", 100.0, fy=fy),
        row("Enterprise Funds", "700000", "Public Utilities", "Vacancy Factor", "Other Personnel Expenditures",
            "Personnel", -30.0, fy=fy),
        row("Enterprise Funds", "700000", "Public Utilities", "Contingency Reserve", "Contingencies",
            "Non-Personnel", -5.0, fy=fy),
        row("Enterprise Funds", "700100", "Public Utilities", "Salaried Wages", "Salaries", "Personnel", 50.0, fy=fy),
        # Lines under $50k either way (ruling R10): not listed, but they count in the fund's value
        row("Enterprise Funds", "700100", "Public Utilities", "Office Supplies", "Supplies", "Non-Personnel",
            0.04, fy=fy),
        row("Enterprise Funds", "700100", "Public Utilities", "Small Refund", "Contingencies", "Non-Personnel",
            -0.03, fy=fy),
        # Pipe Fund: many sub-$50k lines under one category (folded into "Everything else", ruling R10)
        row("Enterprise Funds", "700200", "Public Utilities", "Pipe Contract", "External Contracts & Services",
            "Non-Personnel", 60.0, fy=fy),
        *[row("Enterprise Funds", "700200", "Public Utilities", f"Small Contract {i}",
              "External Contracts & Services", "Non-Personnel", 0.04, fy=fy) for i in range(30)],
        *[row("Enterprise Funds", "700200", "Public Utilities", f"Small Credit {i}",
              "External Contracts & Services", "Non-Personnel", -0.03, fy=fy) for i in range(5)],
        row("Enterprise Funds", "700200", "Public Utilities", "Pipe Supplies", "Supplies",
            "Non-Personnel", 55.0, fy=fy),
        *[row("Enterprise Funds", "700200", "Public Utilities", f"Supply Credit {i}", "Supplies",
              "Non-Personnel", -0.04, fy=fy) for i in range(30)],
        row("Enterprise Funds", "700000", "Public Utilities", "Water Sales", "Charges for Current Services",
            "Charges for Current Services", 180.0, fy=fy),
        # Money tied to a purpose: 14 funds
        *[row("Special Revenue Funds", f"2000{i:02d}", "Transportation", "Salaried Wages", "Salaries",
              "Personnel", 2.0 + i, fy=fy) for i in range(14)],
        row("Special Revenue Funds", "200000", "Transportation", "Gas Tax Apportionment", "Other Local Taxes",
            "Other Local Taxes", 40.0, fy=fy),
        # Internal services & other
        row("Internal Service Funds", "600000", "Fleet", "Vehicle Purchases", "Capital Expenditures",
            "Non-Personnel", 120.0, fy=fy),
        row("Capital Project Funds", "400000", "Transportation", "Consultant", "External Contracts & Services",
            "Non-Personnel", 4.0, fy=fy),
        row("Internal Service Funds", "600000", "Fleet", "Fleet Charges", "Charges for Current Services",
            "Charges for Current Services", 150.0, fy=fy),
        row("Capital Project Funds", "400000", "Transportation", "TransNet Sales Tax", "Sales Tax",
            "Sales Taxes", 46.0, fy=fy),
        # Spending with no fund
        row("", "", "Citywide Other/Special Funds", "City Services Billed", "Internal Contracts & Services",
            "Non-Personnel", 33.8, fy=fy),
        row("", "", "Citywide Other/Special Funds", "Miscellaneous Professional/Technical Ser",
            "External Contracts & Services", "Non-Personnel", 48.6, fy=fy),
        # A proposed-cycle row that select_cycle must ignore
        gf_exp("Police", "Salaried Wages", "Salaries", 5000.0, fy=fy, cycle="proposed"),
    ]
    return rows


UNMATCHED = [
    {"fy": 2026, "cycle": "adopted", "fund_type": "General Fund", "fund_number": "100000",
     "dept_name": "Police", "account": "Mystery", "account_number": "999999", "amount": 0.5 * M},
    {"fy": 2023, "cycle": "adopted", "fund_type": "General Fund", "fund_number": "100000",
     "dept_name": "Police", "account": "Mystery", "account_number": "999999", "amount": 77.0 * M},
]

LABELS = {"pots": {}, "nodes": {}, "categories": {}}


def curated_inputs():
    return dict(
        headline=curated.load(CUR, "headline"),
        funnel=curated.load(CUR, "funnel"),
        gf_revenue=build_gf_revenue(curated.load(CUR, "gf_revenue_fy2027")),
        cip=build_cip(curated.load(CUR, "cip_fy2027")),
    )


def make_tree(rows, labels=LABELS, unmatched=UNMATCHED):
    return build_budget_tree(rows, FUND_NAMES, labels=labels, unmatched=unmatched, **curated_inputs())


def _children(n):
    return n.get("children") or []


def walk(tree):
    """Every node of every map, roots included."""
    stack = [p[side] for p in tree["pots"] for side in ("in", "out")]
    while stack:
        n = stack.pop()
        yield n
        stack.extend(_children(n))


def descendants(node):
    for c in _children(node):
        yield c
        yield from descendants(c)


def max_named_depth(tree):
    def depth(n):
        own = 0 if n["key"] == "_everything_else" else 1
        return own + max((depth(c) for c in _children(n)), default=0)
    return max(max((depth(c) for c in _children(p[side])), default=0)
               for p in tree["pots"] for side in ("in", "out"))


def find_in(node, name):
    for c in _children(node):
        if c["name"] == name:
            return c
        if c["key"] == "_everything_else":
            hit = find_in(c, name)
            if hit:
                return hit
    return None


@pytest.fixture
def tree_from_rows():
    t = make_tree(synthetic_rows())

    def find(pot_id, side, name):
        pot = next(p for p in t["pots"] if p["id"] == pot_id)
        hit = find_in(pot[side], name)
        assert hit is not None, f"{name} not found in {pot_id} {side}"
        return hit
    return SimpleNamespace(tree=t, find=find)


@pytest.fixture
def tree(tree_from_rows):
    return tree_from_rows.tree


@pytest.fixture
def tree_from_rows_with_fy2027():
    return SimpleNamespace(tree=make_tree(synthetic_rows() + synthetic_rows(fy=2027)))


def test_pots_and_bar_values(tree):
    assert [p["id"] for p in tree["pots"]] == ["general_fund", "utilities", "purpose", "cip", "internal"]
    assert [p["value_m"] for p in tree["pots"]] == [2256.7, 1915.1, 1207.9, 858.1, 249.2]
    assert tree["sources"][tree["pots"][4]["src"]]["doc"].startswith("our arithmetic")


def test_gf_top_levels_are_fy2027(tree):
    gf = tree["pots"][0]
    assert gf["in"]["fy"] == 2027 and gf["in"]["value_m"] == 2256.6
    assert len(gf["in"].get("children")) == 10 and gf["in"].get("children")[-1]["name"] == "Everything else"
    assert [c["name"] for c in gf["out"].get("children")][:2] == ["Police", "Fire-Rescue"]
    police = gf["out"].get("children")[0]
    assert police["fy"] == 2027 and police["value_m"] == 718.3
    assert all(c["fy"] == 2026 for c in police.get("children"))


def test_negative_lines_become_offsets(tree_from_rows):
    # dept with Salaries +100 and a vacancy line −30 in group "Other Personnel Expenditures", and Contingencies −5
    d = tree_from_rows.find("utilities", "out", "Water Fund")
    sal = next(c for c in d.get("children") if c["name"] == "Salaries & other pay")
    assert sal["value_m"] == 70.0
    assert d.get("offsets") == [{"name": "Other costs", "value_m": -5.0}]
    assert all(c["value_m"] > 0 for c in walk(tree_from_rows.tree))


def test_offsets_are_listed_at_account_level(tree_from_rows):
    d = tree_from_rows.find("utilities", "out", "Water Fund")
    sal = next(c for c in d.get("children") if c["name"] == "Salaries & other pay")
    assert [c["name"] for c in sal.get("children")] == ["Salaried Wages"]
    assert sal.get("offsets") == [{"name": "Vacancy Factor", "value_m": -30.0}]
    assert d["value_m"] == 65.0


def test_blank_names(tree_from_rows):
    names = [n["name"] for n in walk(tree_from_rows.tree)]
    assert "" not in names and "Not named in the city's data" in names
    internal_out = next(p for p in tree_from_rows.tree["pots"] if p["id"] == "internal")["out"]
    nf = next(c for c in internal_out.get("children") if c["key"] == "_no_fund")  # fixture expense row of 82.4M with fund_type ""
    assert nf["name"] == "Not assigned to a fund in the city's data" and nf["value_m"] == 82.4
    assert tree_from_rows.tree["unassigned"]["value_m"] == 82.4
    assert tree_from_rows.tree["unmatched"]["rows"] >= 1   # fixture row with account 999999


def test_unassigned_and_unmatched_details(tree_from_rows):
    t = tree_from_rows.tree
    assert t["unassigned"] == {"value_m": 82.4, "dept_name": "Citywide Other/Special Funds"}
    assert t["unmatched"] == {"rows": 1, "value_m": 0.5}   # only the detail-year row counts
    nf = tree_from_rows.find("internal", "out", "Not assigned to a fund in the city's data")
    assert {c["name"] for c in nf.get("children")} == {"Contracts & services"}
    unnamed = find_in(tree_from_rows.find("general_fund", "out", "All other"), "Not named in the city's data")
    assert unnamed["key"] == "_unnamed" and unnamed["value_m"] == 19.6


def test_no_unassigned_when_every_row_has_a_fund():
    t = make_tree([r for r in synthetic_rows() if r["fund_type"]], unmatched=None)
    internal_out = t["pots"][4]["out"]
    assert t["unassigned"] is None and t["unmatched"] == {"rows": 0, "value_m": 0.0}
    assert all(c["key"] != "_no_fund" for c in _children(internal_out))


def test_trimming_and_depth(tree_from_rows):
    for n in walk(tree_from_rows.tree):
        assert n.get("children") is None or len(n.get("children")) <= 10
    assert max_named_depth(tree_from_rows.tree) <= 3


def test_everything_else_rolls_up_and_nests(tree_from_rows):
    charges = tree_from_rows.find("general_fund", "in", "Charges for Current Services")
    kids = charges.get("children")
    assert len(kids) == MAX_CHILDREN and kids[-1]["key"] == "_everything_else"
    assert [k["value_m"] for k in kids[:-1]] == sorted((k["value_m"] for k in kids[:-1]), reverse=True)
    inner = kids[-1]
    assert inner["name"] == "Everything else" and inner["fy"] == 2026
    assert len(inner.get("children")) == MAX_CHILDREN and inner.get("children")[-1]["key"] == "_everything_else"
    # 25 accounts: 9 + (9 + 7); the 10 tiny lines (0.4) fold into each Everything else on the way down
    innermost = inner.get("children")[-1]
    assert innermost["value_m"] == round(sum(5.0 + i for i in range(7)) + 0.4, 3)
    assert [c["name"] for c in innermost.get("children")][-1] == "Everything else"
    assert len(innermost.get("children")) == 8 and innermost.get("children")[-1]["value_m"] == 0.4
    assert kids[-1]["value_m"] == round(sum(5.0 + i for i in range(16)) + 0.4, 3)
    assert all(k["key"] == "Charges for Current Services" for k in kids[:-1])


def test_same_year_children_sum_to_parent(tree):
    for n in walk(tree):
        if n.get("children") and all(c["fy"] == n["fy"] for c in n.get("children")):
            s = sum(c["value_m"] for c in n.get("children")) + sum(o["value_m"] for o in n.get("offsets") or [])
            assert abs(s - n["value_m"]) <= 0.01 * n["value_m"]


def test_detail_fy_follows_csv(tree_from_rows_with_fy2027):
    assert tree_from_rows_with_fy2027.tree["detail_fy"] == 2027


def test_csv_roots_carry_detail_year_and_net_sum(tree_from_rows):
    t = tree_from_rows.tree
    assert t["bar_fy"] == 2027 and t["detail_fy"] == 2026
    util = t["pots"][1]
    assert util["out"]["fy"] == 2026 and util["out"]["value_m"] == 229.86   # 65 + 50.01 + 114.85; bar 1915.1
    assert util["out"]["name"] == "Utilities money out" and util["in"]["name"] == "Utilities money in"
    assert util["value_m"] == 1915.1
    internal = t["pots"][4]
    assert internal["out"]["value_m"] == pytest.approx(124.0 + 82.4)
    assert internal["in"]["value_m"] == 196.0
    src = t["sources"][util["out"]["src"]]
    assert src == {"doc": "City of San Diego open data: operating budget CSV, FY2026 adopted",
                   "page": None, "url": CSV_URL}
    assert t["total_m"]["value"] == 6486.9


def test_gf_in_matches_accounts_by_name_or_group(tree_from_rows):
    transfer = tree_from_rows.find("general_fund", "in", "Property Transfer Taxes")
    assert transfer["fy"] == 2027 and transfer["value_m"] == 12.0
    assert transfer.get("children") is None   # 12.0 is under ACCOUNT_LEVEL_MIN_M
    m = {"types": ["Other Local Taxes"], "include": "transfer", "exclude": None}
    by_group = {"account": "Documentary Recording", "account_group": "Property Transfer Tax",
                "account_type": "Other Local Taxes"}
    assert _gf_match(m, by_group) and _gf_match(m, {**by_group, "account_group": "x",
                                                    "account": "Property TRANSFER Tax"})
    assert not _gf_match(m, {**by_group, "account_group": "SDG&E"})
    assert not _gf_match({**m, "include": None, "exclude": "Transfer"}, by_group)
    franchise = tree_from_rows.find("general_fund", "in", "Franchise Fees")
    assert [c["name"] for c in franchise.get("children")] == ["Franchise Tax - SDG&E"]
    prop = tree_from_rows.find("general_fund", "in", "Property Tax")
    assert prop.get("offsets") == [{"name": "Property Tax Refunds", "value_m": -2.0}]
    assert all(c["key"] == "Property Tax" for c in prop.get("children"))


def test_gf_in_unmapped_types_attach_to_other_revenue(tree_from_rows):
    other = tree_from_rows.find("general_fund", "in", "Other Revenue")
    assert {c["name"] for c in other.get("children")} == {"Misc Revenue", "Lighting District Assessment"}


def test_gf_in_unmapped_types_over_limit_stop_the_build():
    rows = synthetic_rows() + [gf_rev("Big Assessment", "Special Assessments", "Special Assessments", 6.0)]
    with pytest.raises(ValueError, match="Special Assessments"):
        make_tree(rows)


def test_gf_out_all_other_and_citywide(tree_from_rows):
    all_other = tree_from_rows.find("general_fund", "out", "All other")
    assert all_other["fy"] == 2027 and all_other["value_m"] == 387.1
    names = {n["name"] for n in descendants(all_other)}
    assert "Small Dept 13" in names and "Not named in the city's data" in names
    assert "Small Dept 0" not in names   # it sits in an Everything else box under the open threshold
    assert "Police" not in names and "Citywide Expenses" not in names and "Major Revenues" not in names
    citywide = tree_from_rows.find("general_fund", "out", "Citywide Program Expenditures")
    assert [c["name"] for c in citywide.get("children")] == ["Contracts & services"]
    police = tree_from_rows.find("general_fund", "out", "Police")
    cats = {c["name"]: c["value_m"] for c in police.get("children")}
    assert cats == {"Salaries & other pay": 280.0, "Overtime": 45.0, "Pension payment": 160.0}
    sal = next(c for c in police.get("children") if c["name"] == "Salaries & other pay")
    assert sal["key"] == "Salaries & other pay" and all(a["key"] == "Salaries & other pay" for a in sal.get("children"))


def test_opening_thresholds(tree_from_rows):
    # Purpose funds hold one salaries line of 2..15M each: under 15M a fund has no categories
    assert tree_from_rows.find("purpose", "out", "Purpose Fund 12").get("children") is None
    big = tree_from_rows.find("purpose", "out", "Purpose Fund 13")
    # 15M opens into categories, but a 15M category is under the 50M account level
    assert [c["name"] for c in big.get("children")] == ["Salaries & other pay"]
    assert big.get("children")[0].get("children") is None
    police = tree_from_rows.find("general_fund", "out", "Police")
    sal = next(c for c in police.get("children") if c["name"] == "Salaries & other pay")
    assert [a["name"] for a in sal.get("children")] == ["Salaried Wages"]
    # GF out "All other": the six smallest departments (1..6M, 21M together) roll into an
    # Everything else box under the 50M open threshold, so it is a leaf
    all_other = tree_from_rows.find("general_fund", "out", "All other")
    ee = all_other.get("children")[-1]
    assert ee["key"] == "_everything_else" and ee["value_m"] == 21.0 and ee.get("children") is None


def test_tiny_lines_net_under_threshold_are_dropped(tree_from_rows):
    # +0.04 and -0.03 fold to 0.01, under 0.05: not listed, still counted in the fund
    sewer = tree_from_rows.find("utilities", "out", "Sewer Fund")
    assert sewer["value_m"] == 50.01
    assert [c["name"] for c in sewer.get("children")] == ["Salaries & other pay"]
    assert sewer.get("offsets") is None


def _sum_gap(n):
    s = sum(c["value_m"] for c in n.get("children") or []) + sum(o["value_m"] for o in n.get("offsets") or [])
    return abs(s - n["value_m"])


def test_many_tiny_lines_fold_into_everything_else(tree_from_rows):
    pipe = tree_from_rows.find("utilities", "out", "Pipe Fund")
    contracts = next(c for c in pipe.get("children") if c["name"] == "Contracts & services")
    assert contracts["value_m"] == 61.05          # 60 + 30 x 0.04 - 5 x 0.03
    assert [c["name"] for c in contracts.get("children")] == ["Pipe Contract", "Everything else"]
    ee = contracts.get("children")[-1]
    assert ee["key"] == "_everything_else" and ee["value_m"] == 1.05 and ee.get("children") is None
    assert contracts.get("offsets") is None
    assert _sum_gap(contracts) <= 0.05
    # credits that fold to a net negative are one "Everything else" offset, never $0.0 lines
    supplies = next(c for c in pipe.get("children") if c["name"] == "Supplies")
    assert supplies["value_m"] == 53.8 and [c["name"] for c in supplies.get("children")] == ["Pipe Supplies"]
    assert supplies.get("offsets") == [{"name": "Everything else", "value_m": -1.2}]
    assert _sum_gap(supplies) <= 0.05
    for n in walk(tree_from_rows.tree):
        assert all(abs(o["value_m"]) >= 0.05 for o in n.get("offsets") or [])


def test_folded_tree_sums_within_005(tree_from_rows):
    # every CSV node's children + offsets match it within 0.05 (tiny lines are folded);
    # curated FY2027 rows are printed, rounded figures and may not foot (CIP 858.0 vs 858.1)
    fy = tree_from_rows.tree["detail_fy"]
    for n in walk(tree_from_rows.tree):
        if n["fy"] == fy and n.get("children") and all(c["fy"] == fy for c in n.get("children")):
            assert _sum_gap(n) <= 0.05, n["name"]


def test_cip_maps(tree):
    cip = tree["pots"][3]
    assert cip["in"]["fy"] == 2027 and cip["in"]["value_m"] == 858.1
    assert cip["in"]["name"] == "Construction projects money in"
    assert len(cip["in"].get("children")) == 10 and cip["in"].get("children")[-1]["key"] == "_everything_else"
    ee = cip["in"].get("children")[-1]
    assert tree["sources"][ee["src"]]["doc"].startswith("our arithmetic")
    pu = find_in(cip["out"], "Public Utilities")
    other = next(c for c in pu.get("children") if c["name"] == "Other projects")
    assert other["value_m"] == pytest.approx(580.7 - 411.8, abs=0.001) and other["fy"] == 2027
    assert tree["sources"][other["src"]]["doc"].startswith("our arithmetic")
    assert find_in(cip["out"], "Parks & Recreation").get("children") is None   # no listed projects
    citywide = find_in(cip["out"], "Citywide")
    assert [c["name"] for c in citywide.get("children")] == ["Convention Center Improvements"]


def test_sources_registry_and_keys(tree):
    used = {n["src"] for n in walk(tree)} | {p["src"] for p in tree["pots"]}
    assert used <= set(tree["sources"])
    assert sorted(tree["sources"], key=lambda k: int(k[1:])) == [f"s{i}" for i in range(len(tree["sources"]))]
    docs = [(s["doc"], s["page"], s["url"]) for s in tree["sources"].values()]
    assert len(docs) == len(set(docs))
    for n in walk(tree):
        assert n["key"] and n["name"]
        if n["name"] == "Everything else":
            assert n["key"] == "_everything_else"


def test_descs_and_answers_copied_from_labels():
    src = {"doc": "FY2027 Adopted Budget Vol. I", "page": 4, "url": "https://example.org/v1.pdf"}
    labels = {
        "pots": {"general_fund": {k: {"text": f"{k} text", "source": src}
                                  for k in ("what", "money_from", "committed_to", "who_decides")}},
        "nodes": {"Police": {"text": "The police department.", "source": src, "link": None}},
        "categories": {"Pension payment": {"text": "Yearly pension payment.", "link": "#pension"}},
    }
    t = make_tree(synthetic_rows(), labels=labels)
    pol = t["descs"]["Police"]
    assert pol["text"] == "The police department." and pol.get("link") is None
    assert t["sources"][pol["src"]] == src
    assert t["descs"]["Pension payment"] == {"text": "Yearly pension payment.", "link": "#pension"}
    gf = t["pots"][0]
    assert gf["answers"]["what"]["text"] == "what text" and t["sources"][gf["answers"]["what"]["src"]] == src
    assert t["pots"][1]["answers"] is None


def test_null_fields_are_omitted_absent_means_null():
    # Ruling R11: nodes omit null children / offsets / src; descs omit null src / link.
    t = make_tree(synthetic_rows(), labels={
        "pots": {}, "nodes": {},
        "categories": {"Overtime": {"text": "Extra hours.", "link": None}}})
    nodes = list(walk(t))
    assert nodes and all(n.get(f, "absent") is not None for n in nodes for f in ("children", "offsets", "src"))
    assert any("children" not in n for n in nodes) and any("offsets" not in n for n in nodes)
    assert all("src" in n for n in nodes)   # every node cites a source today
    assert t["descs"]["Overtime"] == {"text": "Extra hours."}


def test_detail_fy_placeholder_is_filled():
    src = {"doc": "Doc", "page": 1, "url": "https://example.org/x.pdf"}
    labels = {"pots": {"utilities": {k: {"text": "From FY{detail_fy}.", "source": src}
                                     for k in ("what", "money_from", "committed_to", "who_decides")}},
              "nodes": {}, "categories": {"Overtime": {"text": "In FY{detail_fy} data.", "link": None}}}
    t = make_tree(synthetic_rows(), labels=labels)
    fy = t["detail_fy"]
    assert t["pots"][1]["answers"]["what"]["text"] == f"From FY{fy}."
    assert t["descs"]["Overtime"]["text"] == f"In FY{fy} data."
