import csv
from pathlib import Path
import pytest
from pipeline import curated
from pipeline.build import build_gf_revenue, build_cip
ROOT = Path(__file__).parent.parent
CUR = ROOT / "data" / "curated"


def test_gf_revenue_table2():
    d = build_gf_revenue(curated.load(CUR, "gf_revenue_fy2027"))
    by = {c["name"]: c["amount_m"]["value"] for c in d["categories"]}
    assert by == {"Property Tax": 881.0, "Sales Tax": 386.7, "Transient Occupancy Tax": 169.7,
                  "Franchise Fees": 105.7, "Property Transfer Taxes": 12.0, "Licenses & Permits": 57.8,
                  "Fines, Forfeitures, and Penalties": 45.9, "Revenue from Money and Property": 96.7,
                  "Revenue from Federal and Other Agencies": 11.8, "Charges for Current Services": 374.7,
                  "Transfers In": 111.6, "Other Revenue": 3.1}
    assert d["total_m"]["value"] == 2256.6
    assert all(c["amount_m"]["source"]["page"] == 57 for c in d["categories"])


def test_gf_revenue_sum_mismatch_names_path():
    d = curated.load(CUR, "gf_revenue_fy2027")
    d["categories"][0]["amount_m"]["value"] += 5
    with pytest.raises(ValueError, match="categories"):
        build_gf_revenue(d)


def test_gf_revenue_csv_mapping_matches_account_reference():
    d = build_gf_revenue(curated.load(CUR, "gf_revenue_fy2027"))
    with open(ROOT / "data" / "raw" / "ref_accounts.csv", encoding="utf-8", newline="") as f:
        groups = {}
        for r in csv.DictReader(f):
            groups.setdefault(r["account_type"], set()).add(r["account_group"])
    for c in d["categories"]:
        m = c["csv"]
        assert set(m) == {"types", "include", "exclude"}, c["name"]
        assert m["types"] and all(t in groups for t in m["types"]), c["name"]
    csvmap = {c["name"]: c["csv"] for c in d["categories"]}
    assert csvmap["Property Transfer Taxes"] == {"types": ["Other Local Taxes"], "include": "Transfer", "exclude": None}
    assert csvmap["Franchise Fees"] == {"types": ["Other Local Taxes"], "include": None, "exclude": "Transfer"}
    assert csvmap["Revenue from Federal and Other Agencies"]["types"] == [
        "Revenue from Federal Agencies", "Revenue from Other Agencies"]
    assert any("Transfer" in g for g in groups["Other Local Taxes"])


def test_gf_revenue_bad_csv_mapping_names_path():
    d = curated.load(CUR, "gf_revenue_fy2027")
    d["categories"][3]["csv"]["types"] = []
    with pytest.raises(ValueError, match=r"categories\[3\]\.csv"):
        build_gf_revenue(d)


def test_cip_fy2027():
    d = build_cip(curated.load(CUR, "cip_fy2027"))
    assert d["total_m"]["value"] == 858.1
    src = {s["name"]: s["amount_m"]["value"] for s in d["sources"]}
    assert src["Sewer Funds"] == 306.3 and src["Water Fund"] == 283.7 and src["Bond Financing"] == 89.0
    other = d["sources"][-1]
    assert other["name"] == "Other sources" and other["amount_m"]["source"]["doc"].startswith("our arithmetic")
    assert abs(sum(s["amount_m"]["value"] for s in d["sources"]) - 858.1) < 0.05
    dep = {x["name"]: x["amount_m"]["value"] for x in d["departments"]}
    assert dep["Public Utilities"] == 580.7 and dep["Transportation"] == 141.5 and "Police" not in dep
    for x in d["departments"]:
        assert sum(p["amount_m"]["value"] for p in x["projects"]) <= x["amount_m"]["value"] + 0.05


def test_cip_multi_fund_projects_are_labeled_arithmetic():
    d = build_cip(curated.load(CUR, "cip_fy2027"))
    proj = {p["name"]: p["amount_m"] for x in d["departments"] for p in x["projects"]}
    for name in ("Pure Water Program", "Metro Treatment Plants", "Alvarado Laboratory Improvements",
                 "Street Resurfacing and Reconstruction"):
        assert proj[name]["source"]["doc"].startswith("our arithmetic: "), name


def test_cip_input_is_not_mutated_and_other_is_derived_once():
    raw = curated.load(CUR, "cip_fy2027")
    n = len(raw["sources"])
    build_cip(raw)
    assert len(raw["sources"]) == n
    raw["sources"].append({"name": "Other sources", "amount_m": raw["total_m"]})
    with pytest.raises(ValueError, match="sources"):
        build_cip(raw)


def test_cip_department_sum_mismatch_names_path():
    d = curated.load(CUR, "cip_fy2027")
    d["departments"][0]["amount_m"]["value"] += 5
    with pytest.raises(ValueError, match="departments"):
        build_cip(d)


def test_cip_projects_over_department_names_path():
    d = curated.load(CUR, "cip_fy2027")
    d["departments"][0]["projects"][0]["amount_m"]["value"] += 500
    with pytest.raises(ValueError, match=r"departments\[0\]\.projects"):
        build_cip(d)


def test_cip_named_sources_over_total_names_path():
    d = curated.load(CUR, "cip_fy2027")
    d["sources"][0]["amount_m"]["value"] += 100
    with pytest.raises(ValueError, match="sources"):
        build_cip(d)
