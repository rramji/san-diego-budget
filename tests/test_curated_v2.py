import copy
import csv
from pathlib import Path
import pytest
from pipeline import curated
from pipeline.build import build_gf_revenue, build_cip, build_labels, build_why_short
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


def test_labels_cover_pots_and_links():
    d = build_labels(curated.load(CUR, "labels"))
    assert set(d["pots"]) == {"general_fund", "utilities", "purpose", "cip", "internal"}
    assert d["nodes"]["Property Tax"]["link"] == "#why-short"
    assert d["nodes"]["Stormwater"]["link"] == "#infrastructure"
    assert d["categories"]["Pension payment"]["link"] == "#pension"
    assert d["categories"]["_everything_else"]["text"]


_SRC = {"doc": "Test doc", "page": 1, "url": "https://example.org/x.pdf"}
_DETAIL = ("The detail below is from last year's budget (FY{detail_fy}), because this year's "
           "line-by-line data isn't published yet.")


def _valid_labels():
    pots = {}
    for pid in ("general_fund", "utilities", "purpose", "cip", "internal"):
        pots[pid] = {k: {"text": f"{k} text.", "source": dict(_SRC)}
                     for k in ("what", "money_from", "committed_to", "who_decides")}
        if pid in ("utilities", "purpose", "internal"):
            pots[pid]["what"]["text"] = "What it is. " + _DETAIL
    return {"pots": pots,
            "nodes": {"Police": {"text": "One sentence. Two sentences.", "source": dict(_SRC), "link": None}},
            "categories": {"Pension payment": {"text": "Yearly pension payment.", "link": "#pension"}}}


def test_labels_valid_synthetic_passes():
    assert build_labels(_valid_labels())["nodes"]["Police"]["link"] is None


def test_labels_reject_three_sentences_and_unknown_link():
    d = _valid_labels()
    d["nodes"]["Police"]["text"] = "One. Two. Three."
    with pytest.raises(ValueError, match="Police"):
        build_labels(d)
    d = _valid_labels()
    d["categories"]["Pension payment"]["link"] = "#nowhere"
    with pytest.raises(ValueError, match="Pension payment"):
        build_labels(d)


@pytest.mark.parametrize("edit, where", [
    (lambda d: d["pots"].pop("cip"), "cip"),
    (lambda d: d["pots"]["general_fund"].pop("who_decides"), "general_fund"),
    (lambda d: d["pots"]["general_fund"]["what"].update(text="  "), "general_fund"),
    (lambda d: d["pots"]["internal"]["money_from"]["source"].update(url="http://x"), "internal"),
    (lambda d: d["pots"]["utilities"]["what"].update(text="No detail-year sentence."), "utilities"),
    (lambda d: d["pots"]["cip"]["what"].update(text="One. Two. Three. Four."), "cip"),
    (lambda d: d["nodes"]["Police"].pop("source"), "Police"),
    (lambda d: d["categories"]["Pension payment"].update(source=dict(_SRC)), "Pension payment"),
])
def test_labels_reject_bad_pot_answers_and_sources(edit, where):
    d = _valid_labels()
    edit(d)
    with pytest.raises(ValueError, match=where):
        build_labels(d)


def test_labels_input_not_mutated():
    d = _valid_labels()
    before = copy.deepcopy(d)
    build_labels(d)
    assert d == before


def test_why_short_values():
    d = build_why_short(curated.load(CUR, "why_short"))
    sl = {s["label"]: s["cents"]["value"] for s in d["property_dollar"]["slices"]}
    assert abs(sum(sl.values()) - 100) <= 0.2 and d["property_dollar"]["cities_cents"]["value"] == 17.8
    assert {p["city"]: p["rate_pct"]["value"] for p in d["sales_tax"]["peers"]} == {
        "Los Angeles": 10.25, "San Jose": 10.0, "Oakland": 10.75, "San Francisco": 8.625, "Sacramento": 8.75, "San Diego": 7.75}
    me = d["sales_tax"]["measure_e"]
    assert (me["yes_pct"]["value"], me["no_pct"]["value"], me["margin_votes"]["value"], me["est_annual_m"]["value"]) == (49.69, 50.31, 3506, 400)
    assert (d["hotel"]["gf_cents"]["value"], d["hotel"]["base_cents"]["value"], d["hotel"]["gf_m"]["value"]) == (5.5, 10.5, 169.7)
    assert (d["trash"]["moved_m"]["value"], d["trash"]["positions"]["value"], d["trash"]["fee_monthly"]["value"]) == (80.8, 181, 43.60)
    assert (d["growth"]["revenue_pct"]["value"], d["growth"]["inflation_pct"]["value"]) == (3.2, 6.2)
    assert d["growth"]["revenue_period"] == "FY2028–FY2031" and d["growth"]["inflation_period"] == "FY2021–FY2025"
    assert "relatively low, while expectations of and demands for City services are not" in d["quote"]["text"]
    assert d["quote"]["source"]["page"] == 77


def test_why_short_sources_and_arithmetic():
    d = build_why_short(curated.load(CUR, "why_short"))
    pd = d["property_dollar"]
    # The County Auditor's full slice list (Figure 1, p.4), cities split into its two printed slices.
    assert len(pd["slices"]) == 9 and all(s["cents"]["source"]["page"] == 4 for s in pd["slices"])
    cities = [s for s in pd["slices"] if s.get("group") == "Cities"]
    assert sorted(s["cents"]["value"] for s in cities) == [5.4, 12.4]
    assert d["sales_tax"]["measure_e"]["margin_votes"]["source"]["doc"].startswith("our arithmetic: ")
    assert d["sales_tax"]["city_cents_of_rate"]["value"] == 1.0 and d["sales_tax"]["sd_rate_pct"]["value"] == 7.75
    assert (d["property_tax_m"]["value"], d["property_tax_share_pct"]["value"]) == (881.0, 39.0)
    assert d["trash"]["settlement_gf_fy2028_m"]["value"] == 10.8
    assert d["trash"]["settlement_gf_fy2028_m"]["source"]["page"] == 45
    h = d["hotel"]
    assert (h["promo_cents"]["value"], h["council_cents"]["value"]) == (4.0, 1.0)
    assert "June 2, 2026" in d["trash"]["settlement_gf_fy2028_m"]["source"]["doc"]


@pytest.mark.parametrize("edit, where", [
    (lambda d: d["property_dollar"]["slices"][0]["cents"].__setitem__("value", 50.0), "slices"),
    (lambda d: d["property_dollar"]["cities_cents"].__setitem__("value", 18.5), "cities_cents"),
    (lambda d: d["sales_tax"]["measure_e"]["margin_votes"].__setitem__("value", 3000), "margin_votes"),
    (lambda d: d["sales_tax"]["peers"].pop(), "peers"),
    (lambda d: d["growth"].__setitem__("revenue_period", ""), "growth.revenue_period"),
    (lambda d: d["quote"]["source"].__setitem__("url", "http://x"), "quote.source"),
    (lambda d: d["hotel"]["promo_cents"].__setitem__("value", 5.0), "hotel"),
])
def test_why_short_rejects_bad_input(edit, where):
    d = copy.deepcopy(curated.load(CUR, "why_short"))
    edit(d)
    with pytest.raises(ValueError, match=where):
        build_why_short(d)


def test_why_short_input_not_mutated():
    raw = curated.load(CUR, "why_short")
    before = copy.deepcopy(raw)
    build_why_short(raw)
    assert raw == before
