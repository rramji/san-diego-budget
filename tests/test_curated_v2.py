import copy
import csv
import re
from pathlib import Path
import pytest
from pipeline import curated
from pipeline.build import build_gf_revenue, build_cip, build_labels, build_why_short, build_gap_story, build_piles_up
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


def test_gap_story_values():
    d = build_gap_story(curated.load(CUR, "gap_story"))
    h = d["headlines"]
    assert (h["this_year"]["value_m"]["value"], h["worst"]["value_m"]["value"], h["worst"]["without_reserve_m"]["value"]) == (118.0, 203.8, 181.4)
    assert h["worst"]["fy"] == 2025 and h["coming"]["fy"] == 2028
    assert (h["coming"]["city_m"]["value"], h["coming"]["iba_m"]["value"]) == (9.5, 32.9)
    assert [s["amount_m"]["value"] for s in h["coming"]["settlement"]] == [10.8, 9.4]
    assert h["coming"]["note"] == ("The two were measured at different stages. The city's documents don't say whether its "
                                   "$9.5M includes the settlement costs. A new forecast is due November 6, 2026.")
    assert h["coming"]["forecast_due"]["date"] == "2026-11-06"
    r = d["residual"]
    assert (r["one_time_m"]["value"], r["one_time_uses_m"]["value"], r["ongoing_m"]["value"]) == (40.8, 17.7, 23.1)
    assert r["with_reserve_m"]["source"]["doc"].startswith("our arithmetic") and r["with_reserve_m"]["value"] == 103.2
    assert (r["iba_proposed_m"]["value"], r["iba_may_m"]["value"]) == (91.3, 95.4)
    vals = sorted(e["value_m"]["value"] for e in d["timeline"])
    assert vals == sorted([258.2, 88.8, 118.0, 11.2, 15.3, 23.1, 32.9, 9.5])
    assert sorted(e["value2_m"]["value"] for e in d["timeline"] if e["value2_m"]) == [91.3, 95.4]
    assert [x["term"] for x in d["definitions"]] == ["Forecast gap", "Structural deficit", "Balanced budget"]


def test_gap_story_waterfall_steps_and_pages():
    d = build_gap_story(curated.load(CUR, "gap_story"))
    w = d["waterfall"]
    assert [s["kind"] for s in w] == ["start", "up", "subtotal", "down", "subtotal", "down", "down", "down", "end"]
    assert [s["amount_m"]["value"] for s in w] == [118.0, 28.2, 146.2, 26.2, 120.0, 66.4, 44.5, 9.1, 0]
    ours = [s for s in w if s["our_arithmetic"]]
    assert len(ours) == 1 and ours[0]["amount_m"]["source"]["doc"].startswith("our arithmetic: ")
    assert all(not s["amount_m"]["source"]["doc"].startswith("our arithmetic") for s in w if not s["our_arithmetic"])
    cuts = w[5]
    assert cuts["positions"]["value"] == 236.76 and "236.76 positions" in cuts["label"]
    assert all(s["positions"] is None for i, s in enumerate(w) if i != 5)
    assert d["adopted_note"]["positions_change"]["value"] == -133.66
    # Printed footer pages, IBA Report 26-11 (checked in the cached text).
    assert [s["amount_m"]["source"]["page"] for s in w[:7]] == [3, 5, 5, 6, 6, 35, 35]


def test_gap_story_matches_calculator_and_headline():
    d = build_gap_story(curated.load(CUR, "gap_story"))
    gap = curated.load(CUR, "gap")
    headline = curated.load(CUR, "headline")
    assert d["residual"]["with_reserve_m"]["value"] == gap["post_cut_with_reserve_m"]["value"]
    assert d["residual"]["ongoing_m"]["value"] == gap["post_cut_city_m"]["value"]
    assert d["residual"]["skipped_reserve_m"]["value"] == gap["skipped_reserve_m"]["value"]
    assert d["headlines"]["this_year"]["value_m"]["value"] == gap["pre_cut_m"]["value"]
    assert d["adopted_note"]["positions_change"] == headline["gf_fte_change"]


def test_gap_story_timeline_shape():
    d = build_gap_story(curated.load(CUR, "gap_story"))
    for e in d["timeline"]:
        assert re.fullmatch(r"20\d\d-(0[1-9]|1[0-2])", e["date"]), e
        assert e["office"] in ("IBA", "City") and isinstance(e["describes_fy"], int)
        assert e["doc_label"].strip() and e["counts"].strip()


def _bump(path):
    def edit(d):
        node = d
        for k in path[:-1]:
            node = node[k]
        node[path[-1]]["value"] += 1
    return edit


def test_gap_story_rejects_unbalanced_waterfall():
    d = copy.deepcopy(curated.load(CUR, "gap_story"))
    d["waterfall"][6]["amount_m"]["value"] += 1
    with pytest.raises(ValueError, match="waterfall"):
        build_gap_story(d)


@pytest.mark.parametrize("edit, where", [
    (_bump(["waterfall", 2, "amount_m"]), "waterfall"),
    (lambda d: d["waterfall"][1].__setitem__("kind", "sideways"), "waterfall"),
    (lambda d: d["waterfall"][7]["amount_m"]["source"].__setitem__("doc", "IBA"), "waterfall"),
    (_bump(["residual", "with_reserve_m"]), "with_reserve_m"),
    (_bump(["residual", "one_time_uses_m"]), "ongoing_m"),
    (lambda d: d["residual"]["with_reserve_m"]["source"].__setitem__("doc", "IBA"), "with_reserve_m"),
    (lambda d: d["headlines"]["coming"].__setitem__("note", " "), "coming.note"),
    (lambda d: d["headlines"]["coming"]["forecast_due"].__setitem__("date", "Nov 6"), "forecast_due"),
    (lambda d: d["timeline"][0].__setitem__("office", "Mayor"), "timeline"),
    (lambda d: d["timeline"][0].__setitem__("date", "2024-13"), "timeline"),
    (lambda d: d["definitions"][0]["source"].__setitem__("url", "http://x"), "definitions"),
    (lambda d: d["headlines"]["worst"].pop("without_reserve_m"), "worst"),
])
def test_gap_story_rejects_bad_input(edit, where):
    d = copy.deepcopy(curated.load(CUR, "gap_story"))
    edit(d)
    with pytest.raises(ValueError, match=where):
        build_gap_story(d)


def test_gap_story_input_not_mutated():
    raw = curated.load(CUR, "gap_story")
    before = copy.deepcopy(raw)
    build_gap_story(raw)
    assert raw == before


def test_piles_up_values():
    d = build_piles_up(curated.load(CUR, "piles_up"))
    r = d["reserves"]
    assert (r["balance_m"]["value"], r["target_m"]["value"], r["goal_pct"]["value"], r["draw_m"]["value"]) == (202.4, 262.9, 16.7, 4.7)
    assert (r["goal_fy"], r["unaudited"], r["skipped_m"]["value"], r["years_to_goal"]["value"]) == (2030, True, 80.1, 15)
    assert (r["balance_pct"]["value"], r["target_pct"]["value"]) == (10.9, 14.1)
    i = d["infrastructure"]
    assert (round(i["gap_m"]["value"]), round(i["needs_m"]["value"]), round(i["funding_m"]["value"])) == (7815, 12825, 5010)
    assert round(i["prior_gap_m"]["value"]) == 6506
    a = {x["asset"]: round(x["gap_m"]["value"]) for x in i["by_asset"]}
    assert a["Stormwater"] == 5085 and a["Sidewalks"] == 253
    assert abs(sum(x["gap_m"]["value"] for x in i["by_asset"]) - i["gap_m"]["value"]) <= 1
    rd = i["roads"]; assert (rd["pci_2016"]["value"], rd["pci_2023"]["value"], rd["goal_new"]["value"], rd["pci_2036"]["value"]) == (71, 63, 65, 52)
    assert (rd["goal_old"]["value"], rd["funding_share_pct"]["value"], rd["pci_2027"]["value"], rd["poor_share_text"]) == (70, 32, 63, "nearly 34%")
    p = d["pension"]
    assert {x["label"]: x["amount_m"]["value"] for x in p["payers"]} == {
        "General Fund": 396.300918, "Utilities": 106.011172, "Money tied to a purpose": 47.210165,
        "Internal services": 10.771424, "Other": 2.905442}
    assert abs(sum(x["amount_m"]["value"] for x in p["payers"]) - 563.199121) < 1e-6
    assert all(x["amount_m"]["source"]["page"] == 30 for x in p["payers"])
    assert (p["funded_pct"]["value"], p["rise_m"]["value"], p["fy2028_m"]["value"], p["fy2029_m"]["value"]) == (76.1, 26.4, 573.2, 493.4)
    assert (p["valuation_date"], p["full_funding_valuation"]) == ("2025-06-30", "2041-06-30")
    assert (round(p["liability_m"]["value"], 1), round(p["assets_m"]["value"], 1), round(p["shortfall_m"]["value"], 1)) == (14513.2, 11048.9, 3464.3)


def test_piles_up_sources_pages_and_arithmetic():
    d = build_piles_up(curated.load(CUR, "piles_up"))
    r, i, p = d["reserves"], d["infrastructure"], d["pension"]
    # Printed footer pages, checked in the cached pdftotext extracts.
    assert (r["balance_m"]["source"]["page"], r["target_m"]["source"]["page"], r["draw_m"]["source"]["page"],
            r["skipped_m"]["source"]["page"], r["years_to_goal"]["source"]["page"], r["goal_pct"]["source"]["page"]) == (20, 37, 12, 5, 38, 3)
    assert (i["gap_m"]["source"]["page"], i["prior_gap_m"]["source"]["page"]) == (35, 37)
    pages = {x["asset"]: x["gap_m"]["source"]["page"] for x in i["by_asset"]}
    assert len(pages) == 22 and pages["Stormwater"] == 61 and pages["Streets and roads, pavement"] == 45 and pages["Parks"] == 53
    assert all(x["gap_m"]["value"] == 0 for x in i["by_asset"] if x["asset"] in ("Water", "Wastewater", "Pure Water"))
    rd = i["roads"]
    assert (rd["pci_2016"]["source"]["page"], rd["pci_2023"]["source"]["page"], rd["poor_share_pct"]["source"]["page"],
            rd["funding_share_pct"]["source"]["page"], rd["pci_2036"]["source"]["page"]) == (73, 73, 45, 13, 15)
    assert (p["liability_m"]["source"]["page"], p["rise_m"]["source"]["page"], p["fy2028_m"]["source"]["page"]) == (3, 30, 12)
    g = i["growth_m"]
    assert g["source"]["doc"].startswith("our arithmetic: ") and abs(g["value"] - (i["gap_m"]["value"] - i["prior_gap_m"]["value"])) < 0.05
    assert i["funded"]["water_sewer_pct"]["source"]["doc"].startswith("our arithmetic: ")
    ours = [k for k, v in r.items() if isinstance(v, dict) and v.get("source", {}).get("doc", "").startswith("our arithmetic")]
    assert ours == []
    # Never the $8.21B Vol. III "unidentified funding" measure, and never call Fire Station 51 or San Carlos library funded.
    text = str(d)
    assert "8,212" not in text and "8212" not in text and "Station 51" not in text and "San Carlos" not in text
    assert [e["name"] for e in i["examples"]] and all(e["note"].strip() for e in i["examples"])
    assert [s["step"] for s in i["process"]][-1].startswith("June")


def _set(path, value):
    def edit(d):
        node = d
        for k in path[:-1]:
            node = node[k]
        node[path[-1]] = value
    return edit


@pytest.mark.parametrize("edit, where", [
    (_bump(["infrastructure", "by_asset", 3, "gap_m"]), "by_asset"),
    (lambda d: d["infrastructure"]["by_asset"].pop(0), "by_asset"),
    (lambda d: d["infrastructure"]["by_asset"][5].__setitem__("asset", "Stormwater"), "by_asset"),
    (_bump(["pension", "payers", 0, "amount_m"]), "payers"),
    (lambda d: d["pension"]["payers"].pop(), "payers"),
    (lambda d: d["pension"]["shortfall_m"].__setitem__("value", 3470.0), "shortfall_m"),
    (_bump(["infrastructure", "needs_m"]), "needs_m"),
    (_set(["reserves", "unaudited"], False), "unaudited"),
    (_set(["pension", "valuation_date"], "June 2025"), "valuation_date"),
    (_set(["pension", "full_funding_valuation"], "2041"), "full_funding_valuation"),
    (lambda d: d["reserves"].pop("target_m"), "reserves.target_m"),
    (_bump(["infrastructure", "growth_m"]), "growth_m"),
    (lambda d: d["infrastructure"]["growth_m"]["source"].__setitem__("doc", "IBA"), "growth_m"),
    (lambda d: d["infrastructure"]["examples"][0].__setitem__("name", " "), "examples"),
    (lambda d: d["infrastructure"]["process"][0].__setitem__("source", {"doc": "x", "page": 1, "url": "http://x"}), "process"),
    (_set(["infrastructure", "roads", "poor_share_text"], ""), "poor_share_text"),
    (lambda d: d["cites"]["full_funding"].__setitem__("url", ""), "cites"),
])
def test_piles_up_rejects_bad_input(edit, where):
    d = copy.deepcopy(curated.load(CUR, "piles_up"))
    edit(d)
    with pytest.raises(ValueError, match=where):
        build_piles_up(d)


def test_piles_up_input_not_mutated():
    raw = curated.load(CUR, "piles_up")
    before = copy.deepcopy(raw)
    build_piles_up(raw)
    assert raw == before
