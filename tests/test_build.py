import json
import shutil
from pathlib import Path

from pipeline import checks
from pipeline.build import build_all

ROOT = Path(__file__).parent.parent
FIX = Path(__file__).parent / "fixtures"
CURATED = ROOT / "data" / "curated"


def _build(tmp_path):
    out = tmp_path / "build"
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    return out, build_all(FIX, cur, out)


def test_build_all_writes_expected_files(tmp_path):
    out, paths = _build(tmp_path)
    assert sorted(p.name for p in paths) == [
        "budget_tree.json", "claims.json", "cuts.json", "flows.json", "funnel.json", "gap.json",
        "gap_story.json", "glossary.json", "headline.json", "piles_up.json", "series.json",
        "structural_deficit.json", "why_short.json"
    ]
    assert sorted(p.name for p in out.glob("*.json")) == sorted(p.name for p in paths)
    text = (out / "series.json").read_text()
    assert "\n" not in text.strip() and ": " not in text
    series = json.loads(text)
    assert series["vintage"] == {"fetched_at": None, "sha256": {}}  # tolerant build; checks.run flags it
    assert series["gf_dept_by_fy"]["2025"][0][0]


def test_series_fy_keys_are_four_digit_ints(tmp_path):
    out, _ = _build(tmp_path)
    series = json.loads((out / "series.json").read_text())
    assert "2023" in series["gf_by_fy"] and "23" not in series["gf_by_fy"]
    assert all(len(k) == 4 and k.isdigit() for k in series["gf_dept_by_fy"])


def test_checks_flag_size_over_300kb(tmp_path):
    out, _ = _build(tmp_path)
    (out / "dummy.json").write_text("x" * 301_000)
    msgs = checks.run(out)
    assert any("300" in m for m in msgs)


def test_series_values_rounded_to_three_decimals_and_compact(tmp_path):
    raw = tmp_path / "raw"
    shutil.copytree(FIX, raw)
    f = raw / "operating_budget.csv"
    f.write_text(f.read_text().replace('"120","23"', '"123456","23"'))
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    out = tmp_path / "build"
    build_all(raw, cur, out)
    text = (out / "series.json").read_text()
    assert '": ' not in text and '", ' not in text
    prop = json.loads(text)["gf_by_fy"]["2023"]["by_account_type"]["Property Tax Revenue"]
    assert prop == 0.123
    assert "0.123456" not in text


def _fig(value):
    return {"value": value, "source": {"doc": "IBA test doc", "page": 1, "url": "https://example.org/x.pdf"}}


def _deficit_entry(fy, **kw):
    e = {"fy": fy, "reported": True, "structural_deficit_m": _fig(10.0), "one_time_resources_m": None,
         "one_time_expenditures_m": None, "suspended_reserve_m": None, "includes_suspended_reserve": False,
         "components": None, "resources_include_reserve": False,
         "basis": "adopted budget; net of one-time expenditures", "note": "t"}
    e.update(kw)
    return e


def _deficit_years(override=None):
    override = override or {}
    return [override.get(fy) or _deficit_entry(fy) for fy in range(2012, 2028)]


def _sd_raises(entries, match):
    import pytest
    from pipeline.build import build_structural_deficit
    with pytest.raises(ValueError, match=match):
        build_structural_deficit(entries, {"gf_by_fy": {}})


def test_structural_deficit_accepts_full_valid_years():
    from pipeline.build import build_structural_deficit
    out = build_structural_deficit(_deficit_years(), {"gf_by_fy": {}})
    assert [e["fy"] for e in out["years"]] == list(range(2012, 2028))


def test_structural_deficit_rejects_duplicate_year():
    years = _deficit_years()
    years[5] = _deficit_entry(2016)
    _sd_raises(years, r"duplicate fy \[2016\]")


def test_structural_deficit_rejects_missing_or_extra_year():
    _sd_raises(_deficit_years()[:-1], r"exactly FY2012-FY2027 \(missing \[2027\]")
    _sd_raises(_deficit_years() + [_deficit_entry(2028)], r"unexpected \[2028\]")


def test_structural_deficit_reported_requires_figure():
    _sd_raises(_deficit_years({2019: _deficit_entry(2019, structural_deficit_m=None)}),
               r"^\[7\]\.structural_deficit_m: required when reported")


def test_structural_deficit_unreported_must_have_no_figures_or_components():
    bad_fig = _deficit_entry(2016, reported=False, structural_deficit_m=None, suspended_reserve_m=_fig(1.0))
    _sd_raises(_deficit_years({2016: bad_fig}), r"^\[4\]\.suspended_reserve_m: must be null")
    bad_val = _deficit_entry(2016, reported=False)
    _sd_raises(_deficit_years({2016: bad_val}), r"^\[4\]\.structural_deficit_m: must be null")
    bad_comp = _deficit_entry(2016, reported=False, structural_deficit_m=None, components=[{"label": "x", "amount_m": 1}])
    _sd_raises(_deficit_years({2016: bad_comp}), r"^\[4\]\.components: must be null")


def test_structural_deficit_reported_and_resources_flag_must_be_boolean():
    _sd_raises(_deficit_years({2020: _deficit_entry(2020, reported="yes")}), r"^\[8\]\.reported: required boolean")
    _sd_raises(_deficit_years({2020: _deficit_entry(2020, resources_include_reserve=None)}),
               r"^\[8\]\.resources_include_reserve: required boolean")


def test_curated_structural_deficit_pins_transcribed_values():
    from pipeline import curated
    years = {e["fy"]: e for e in curated.load(CURATED, "structural_deficit")}
    assert {fy: years[fy]["structural_deficit_m"]["value"] for fy in range(2022, 2028)} == {
        2022: 96.7, 2023: 38.3, 2024: 99.5, 2025: 181.4, 2026: 48.0, 2027: 11.2}
    assert {fy: years[fy]["suspended_reserve_m"]["value"] for fy in range(2022, 2028)} == {
        2022: 10.7, 2023: 24.3, 2024: 0, 2025: 22.4, 2026: 55.6, 2027: 80.1}
    reported = [fy for fy, e in years.items() if e["reported"]]
    unreported = [fy for fy, e in years.items() if not e["reported"]]
    assert len(reported) == 12 and unreported == [2015, 2016, 2017, 2021]
    assert years[2012]["includes_suspended_reserve"] is True
    assert (years[2012]["structural_deficit_m"]["value"], years[2012]["suspended_reserve_m"]["value"]) == (35.1, 14.1)


def test_structural_deficit_merges_gf_expenditure(tmp_path):
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    base = {"one_time_resources_m": None, "one_time_expenditures_m": None,
            "suspended_reserve_m": None, "includes_suspended_reserve": False, "components": None,
            "resources_include_reserve": False,
            "basis": "proposed budget; gross one-time resources"}
    special = {
        2013: {"fy": 2013, "reported": False, "structural_deficit_m": None, **base,
               "note": "IBA report 12-16 not located online"},
        2023: {"fy": 2023, "reported": True, "structural_deficit_m": _fig(38.3), **base, "note": "t"},
        2027: {"fy": 2027, "reported": True, "structural_deficit_m": _fig(11.2), **base, "note": "t"},
    }
    entries = [special.get(fy) or _deficit_entry(fy) for fy in range(2012, 2028)]
    (cur / "structural_deficit.json").write_text(json.dumps(entries))
    out = tmp_path / "build"
    build_all(FIX, cur, out)
    built = json.loads((out / "structural_deficit.json").read_text())
    assert built["convention"] == "positive = size of General Fund structural gap, $ millions"
    years = {e["fy"]: e for e in built["years"]}
    assert years[2023]["gf_expenditure_adopted_m"] == 0.0  # fixture: $150 -> 0.00015M, rounded
    assert years[2023]["structural_deficit_m"]["value"] == 38.3
    assert years[2013]["reported"] is False and years[2013]["structural_deficit_m"] is None
    assert years[2013]["gf_expenditure_adopted_m"] is None  # FY absent from fixture series
    assert years[2027]["gf_expenditure_adopted_m"] is None
    markers = {m["fy"]: m for m in built["markers"]}
    assert sorted(markers) == [2011, 2025, 2026, 2028]
    assert markers[2011]["label"] == "2010: temporary sales tax measure fails"
    assert markers[2025]["label"] == "2024: sales tax measure fails"
    assert markers[2028]["label"] == "FY2028 outlook: city $9.5M (adopted budget), IBA $32.9M (estimated at the proposed budget)"
    assert "as estimated at the time of the Proposed Budget" in markers[2028]["figures"][1]["source"]["doc"]
    for fy in (2011, 2025, 2026):
        src = markers[fy]["source"]["source"]
        assert src["url"].startswith("https://") and src["page"] in (3, 77)
    assert [f["value"] for f in markers[2028]["figures"]] == [9.5, 32.9]
    assert "source" not in markers[2028]


def test_structural_deficit_rejects_unsourced_figure(tmp_path):
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    (cur / "structural_deficit.json").write_text(json.dumps(
        [{"fy": 2020, "reported": True, "structural_deficit_m": {"value": 5}, "basis": "x", "note": "",
          "resources_include_reserve": False}]))
    import pytest
    with pytest.raises(ValueError, match=r"^\[0\]\.structural_deficit_m"):
        build_all(FIX, cur, tmp_path / "build")


def test_structural_deficit_requires_basis(tmp_path):
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    (cur / "structural_deficit.json").write_text(json.dumps(
        [{"fy": 2016, "reported": False, "structural_deficit_m": None, "note": ""}]))
    import pytest
    with pytest.raises(ValueError, match=r"^\[0\]\.basis"):
        build_all(FIX, cur, tmp_path / "build")


def test_structural_deficit_requires_resources_include_reserve(tmp_path):
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    (cur / "structural_deficit.json").write_text(json.dumps(
        [{"fy": 2016, "reported": False, "structural_deficit_m": None, "basis": "x", "note": ""}]))
    import pytest
    with pytest.raises(ValueError, match=r"^\[0\]\.resources_include_reserve"):
        build_all(FIX, cur, tmp_path / "build")


def test_curated_resources_include_reserve_flags():
    from pipeline import curated
    years = {e["fy"]: e for e in curated.load(CURATED, "structural_deficit")}
    assert [fy for fy, e in years.items() if e["resources_include_reserve"]] == [2012, 2025, 2026]
    for e in years.values():
        assert "_m" not in e["note"] and "null" not in e["note"] and "http" not in e["note"]


FY2027_BASIS = (
    "proposed budget; net of one-time expenditures (IBA review of the FY2027 Proposed Budget; "
    "the Adopted Budget's own residual is $23.1M)"
)


def test_curated_structural_deficit_covers_2012_2027_with_basis():
    from pipeline import curated
    years = curated.load(CURATED, "structural_deficit")
    assert [e["fy"] for e in years] == list(range(2012, 2028))
    for e in years:
        expected = ("proposed budget; gross one-time resources" if e["fy"] <= 2021
                    else FY2027_BASIS if e["fy"] == 2027
                    else "adopted budget; net of one-time expenditures")
        assert e["basis"] == expected
        assert (e["structural_deficit_m"] is None) == (not e["reported"])


SRC = {"doc": "d", "page": 1, "url": "https://example.org/x"}


def _flows(links=None, nodes=None):
    nodes = nodes or [{"id": "a", "label": "A", "column": 0, "kind": "utility"},
                      {"id": "b", "label": "B", "column": 1, "kind": "utility"}]
    links = links if links is not None else [
        {"source": "a", "target": "b", "amount_m": 1.0, "rule": "r", "ref": SRC, "highlight": True}]
    return {"fy": 2027, "nodes": nodes, "links": links}


def test_build_flows_rejects_dangling_link():
    import pytest
    from pipeline.build import build_flows
    bad = _flows([{"source": "a", "target": "ghost", "amount_m": 1.0, "rule": "r", "ref": SRC, "highlight": True}])
    with pytest.raises(ValueError, match="ghost"):
        build_flows(bad)


def test_build_flows_requires_exactly_one_highlight():
    import pytest
    from pipeline.build import build_flows
    link = {"source": "a", "target": "b", "amount_m": 1.0, "rule": "r", "ref": SRC}
    with pytest.raises(ValueError, match="exactly one highlight"):
        build_flows(_flows([{**link, "highlight": False}]))
    with pytest.raises(ValueError, match="exactly one highlight"):
        build_flows(_flows([{**link, "highlight": True}, {**link, "highlight": True}]))
    assert build_flows(_flows())["fy"] == 2027


def test_build_flows_validates_ref_with_path():
    import pytest
    from pipeline.build import build_flows
    link = {"source": "a", "target": "b", "amount_m": 1.0, "rule": "r", "highlight": True}
    with pytest.raises(ValueError, match=r"^links\[0\]\.ref"):
        build_flows(_flows([{**link, "ref": {**SRC, "url": "http://insecure"}}]))
    with pytest.raises(ValueError, match=r"^links\[0\]\.ref"):
        build_flows(_flows([link]))


def test_curated_flows_column1_nodes_balance():
    from pipeline import curated
    from pipeline.build import build_flows
    flows = build_flows(curated.load(CURATED, "flows"))
    col1 = [n["id"] for n in flows["nodes"] if n["column"] == 1]
    assert len(col1) == 4
    for nid in col1:
        inflow = sum(l["amount_m"] for l in flows["links"] if l["target"] == nid)
        outflow = sum(l["amount_m"] for l in flows["links"] if l["source"] == nid)
        assert abs(inflow - outflow) <= 1.0, (nid, inflow, outflow)


def test_curated_flows_gf_matches_funnel_and_headline():
    from pipeline import curated
    flows = curated.load(CURATED, "flows")
    funnel = curated.load(CURATED, "funnel")
    headline = curated.load(CURATED, "headline")
    out = {l["target"]: l["amount_m"] for l in flows["links"] if l["source"] == "gf_decides"}
    label = {n["id"]: n["label"] for n in flows["nodes"]}
    by_label = {label[k]: v for k, v in out.items()}
    for d in funnel["bar4"]:
        assert by_label[d["dept"]] == d["amount_m"]["value"]
    assert abs(sum(out.values()) - headline["general_fund_m"]["value"]) <= 0.1
    assert 15 <= len(flows["links"]) <= 30
    hl = [l for l in flows["links"] if l["highlight"]]
    assert (hl[0]["source"], hl[0]["target"]) == ("rule_capital", "bike_ped") and hl[0]["amount_m"] == 6.5
    assert all(k in hl[0]["rule"] for k in ("borrowed money", "capital projects the city chooses", "day-to-day services"))
    assert "Active Transportation Program" not in hl[0]["rule"] and "never" not in hl[0]["rule"]


def test_curated_flows_bonds_split_bike_and_roads():
    from pipeline import curated
    flows = curated.load(CURATED, "flows")
    kind = {n["id"]: n["kind"] for n in flows["nodes"]}
    assert kind["bonds"] == "borrowed" and kind["rule_capital"] == "borrowed"
    amt = {(l["source"], l["target"]): l["amount_m"] for l in flows["links"]}
    assert amt[("rule_capital", "bike_ped")] == 6.5 and amt[("rule_capital", "roads")] == 79.497
    assert amt[("rule_restricted", "bike_ped")] == 0.273 and amt[("rule_restricted", "roads")] == 18.588
    assert amt[("bonds", "rule_capital")] == round(6.5 + 79.497, 3)
    rules = {(l["source"], l["target"]): l["rule"] for l in flows["links"]}
    assert "capital projects the city chooses" in rules[("bonds", "rule_capital")]


def test_build_flows_rejects_unknown_kind():
    import pytest
    from pipeline.build import build_flows
    nodes = [{"id": "a", "label": "A", "column": 0, "kind": "grant"},
             {"id": "b", "label": "B", "column": 1, "kind": "utility"}]
    with pytest.raises(ValueError, match=r"^nodes\[0\]\.kind"):
        build_flows(_flows(nodes=nodes))


def test_curated_cuts_shape():
    from pipeline import curated
    cuts = curated.load(CURATED, "cuts")
    assert cuts["fy"] == 2027 and len(cuts["reductions"]) >= 11
    for r in cuts["reductions"]:
        assert r["fund"] == "General Fund" and r["reason"].strip()
        assert r["amount_m"] is None or r["amount_m"]["value"] > 0
    assert any(r["amount_m"] is None for r in cuts["reductions"])
    assert len(cuts["restorations"]) >= 5


def _cip(name, fund_type, amount, fy=2025, cycle="adopted"):
    return {"fy": fy, "cycle": cycle, "fund_type": fund_type, "fund_number": "x", "dept": "Transportation",
            "project_number": name[:8], "project_name": name, "account": "a", "amount": amount}


def _claims_curated():
    from pipeline import curated
    return curated.load(CURATED, "claims")


def test_build_claims_bike_chart_has_two_groups():
    from pipeline.build import build_claims
    cip = [
        _cip("Minor Bike Facilities", "TransNet Funds", 250_000),
        _cip("Minor Bike Facilities", "Bond Financing", 1_000_000),
        _cip("Park Blvd Bicycle Facility", "Bond Financing", 500_000),
        _cip("Resurfacing of City Streets", "Bond Financing", 80_000_000),
        _cip("Slurry Seal Group A", "TransNet Funds", 16_000_000),
        _cip("Sewer Main Replacements", "Sewer Funds", 9_000_000),
        _cip("Minor Bike Facilities", "Development Impact Fees", 51),
        _cip("Minor Bike Facilities", "Bond Financing", 7_000_000, cycle="proposed"),
        _cip("Minor Bike Facilities", "Bond Financing", 3_000_000, fy=2024),
    ]
    series = {"gf_by_fy": {}, "gf_dept_by_fy": {}}
    claims = {c["id"]: c for c in build_claims(_claims_curated(), cip, series)}
    bike = claims["bike-lanes"]
    chart = bike["chart"]
    assert chart["type"] == "grouped_bar" and chart["fy"] == 2025
    groups = {g["label"]: {s["label"]: s["amount_m"] for s in g["series"]} for g in chart["groups"]}
    assert list(groups) == ["Bike & pedestrian projects", "Road repair"]
    assert groups["Bike & pedestrian projects"]["Bond Financing"] == 1.5
    assert groups["Bike & pedestrian projects"]["TransNet Funds"] == 0.25
    assert groups["Road repair"]["Bond Financing"] == 80.0
    assert groups["Road repair"]["TransNet Funds"] == 16.0
    assert "Sewer Funds" not in groups["Road repair"]
    assert "Development Impact Fees" not in groups["Road repair"]  # $51 total: dropped as an empty bar
    assert groups["Road repair"]["Bond Financing"] == 80.0 and groups["Bike & pedestrian projects"].keys() == groups["Road repair"].keys()
    assert bike["matched_projects"] == ["Minor Bike Facilities", "Park Blvd Bicycle Facility"]


def test_build_claims_counts_bikeway_repair_once_as_bike():
    from pipeline.build import build_claims
    cip = [_cip("University Ave Bikeway Pavement Repair", "Bond Financing", 6_500_000),
           _cip("Resurfacing of City Streets", "Bond Financing", 1_000_000)]
    out = {c["id"]: c for c in build_claims(_claims_curated(), cip, {"gf_by_fy": {}, "gf_dept_by_fy": {}})}
    g = {x["label"]: {s["label"]: s["amount_m"] for s in x["series"]} for x in out["bike-lanes"]["chart"]["groups"]}
    assert g["Bike & pedestrian projects"]["Bond Financing"] == 6.5
    assert g["Road repair"]["Bond Financing"] == 1.0


def test_build_claims_homelessness_line_omits_missing_years():
    from pipeline.build import build_claims
    series = {
        "gf_by_fy": {"2020": {"expense_m": 1000.0}, "2022": {"expense_m": 2000.0}, "2023": {"expense_m": 2000.0}},
        "gf_dept_by_fy": {"2020": [["Police", 500.0]],
                          "2022": [["Police", 600.0], ["Homelessness Strategies & Solutions", 20.0]],
                          "2023": [["Homelessness Strategies & Solutions", 50.0]]},
    }
    out = {c["id"]: c for c in build_claims(_claims_curated(), [], series)}
    chart = out["homelessness"]["chart"]
    assert chart["type"] == "line"
    assert chart["points"] == [{"fy": 2022, "amount_m": 20.0, "share_pct": 1.0},
                               {"fy": 2023, "amount_m": 50.0, "share_pct": 2.5}]
    assert chart["adopted_next"] is None
    assert out["homelessness"]["matched_projects"] is None


def test_curated_claims_shape():
    import re
    claims = _claims_curated()
    assert [c["id"] for c in claims] == ["bike-lanes", "pensions", "managers", "trash-fee", "homelessness"]
    split = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"$(])")
    for c in claims:
        assert c["claim"].strip() and c["sources"]
        assert len(split.split(c["finding"].strip())) <= 4, c["id"]
        assert len(split.split(c["caveat"].strip())) == 1, c["id"]
    managers = next(c for c in claims if c["id"] == "managers")
    assert managers["chart"] is None and "Axios" in managers["finding"]
    assert "not accessible" in managers["finding"] and "headline" in managers["finding"]
    homeless = next(c for c in claims if c["id"] == "homelessness")
    assert "COVID-19" in homeless["finding"] and "May Revision" in homeless["finding"]
    assert any(s["page"] == 120 and "21-10" in s["doc"] for s in homeless["sources"])
    assert any(s["page"] == 46 and "26-11" in s["doc"] for s in managers["sources"])


def test_build_claims_rejects_bad_source():
    import pytest
    from pipeline.build import build_claims
    bad = [{"id": "x", "claim": "c", "finding": "f.", "caveat": "c.", "chart": None,
            "sources": [{"doc": "d", "page": 1, "url": "http://insecure"}]}]
    with pytest.raises(ValueError, match=r"^claims\[0\]\.sources\[0\]"):
        build_claims(bad, [], {"gf_by_fy": {}, "gf_dept_by_fy": {}})


def test_gap_gets_cuttable_from_funnel(tmp_path):
    from pipeline import curated
    out, _ = _build(tmp_path)
    gap = json.loads((out / "gap.json").read_text())
    funnel = curated.load(CURATED, "funnel")
    assert gap["cuttable_m"] == funnel["bar3"]["everything_else_m"]
    assert "cuttable_m" not in json.loads((CURATED / "gap.json").read_text())
    for k in ("pre_cut_m", "post_cut_city_m", "post_cut_with_reserve_m", "skipped_reserve_m",
              "population", "households", "sales_tax_1pct_m"):
        assert gap[k]["value"] > 0 and gap[k]["source"]["url"].startswith("https://"), k
    assert round(gap["post_cut_city_m"]["value"] + gap["skipped_reserve_m"]["value"], 1) == gap["post_cut_with_reserve_m"]["value"]


def test_curated_glossary_terms():
    import re
    gl = json.loads((CURATED / "glossary.json").read_text())
    terms = [g["term"] for g in gl]
    assert len(terms) == 12 and "General Fund" in terms
    for g in gl:
        assert len(re.split(r"(?<=[.!?])\s+", g["plain"].strip())) <= 2, g["term"]


def test_build_claims_homelessness_carries_next_adopted_year_from_funnel():
    from pipeline import curated
    from pipeline.build import build_claims
    series = {"gf_by_fy": {"2026": {"expense_m": 2000.0}},
              "gf_dept_by_fy": {"2026": [["Homelessness Strategies & Solutions", 50.0]]}}
    funnel = curated.load(CURATED, "funnel")
    chart = {c["id"]: c for c in build_claims(_claims_curated(), [], series, funnel)}["homelessness"]["chart"]
    nxt = chart["adopted_next"]
    assert nxt["fy"] == 2027 and nxt["amount_m"]["value"] == 62.0 and nxt["amount_m"]["source"]["page"] == 89


def test_curated_homelessness_states_gf_share_and_tot():
    h = next(c for c in _claims_curated() if c["id"] == "homelessness")
    assert "2.5% of General Fund spending" in h["finding"]
    assert "hotel-tax (TOT) revenue, including Measure C funds" in h["finding"]


def test_curated_trash_fee_settlement_is_approved():
    import re
    t = next(c for c in _claims_curated() if c["id"] == "trash-fee")
    assert "June 8, 2026" in t["finding"] and "tentative" not in t["finding"]
    assert "July 2027" in t["finding"] and "$10.8 million" in t["finding"]
    assert len(re.split(r"(?<=[.!?])\s+", t["finding"].strip())) <= 4
    assert any(s["url"].endswith("reduced-trash-collection-fees-for-city-of-san-diego-customers-effective-july-1-2027.pdf") for s in t["sources"])


def test_v2_corrections(tmp_path):
    out, _ = _build(tmp_path)
    f = json.loads((out / "funnel.json").read_text())
    assert f["bar3"]["pension_adc_m"]["value"] == 396.3
    assert f["bar3"]["pension_adc_m"]["source"]["page"] == 30
    assert f["bar3"]["everything_else_m"]["value"] == 1785.4
    g = json.loads((out / "gap.json").read_text())
    assert "post_cut_iba_m" not in g and "fy2028_projection_m" not in g
    w = g["post_cut_with_reserve_m"]
    assert w["value"] == 103.2 and w["source"]["doc"].startswith("our arithmetic: 23.1 + 80.1")
    assert g["cuttable_m"]["value"] == 1785.4
    sd = json.loads((out / "structural_deficit.json").read_text())
    m28 = next(m for m in sd["markers"] if m["fy"] == 2028)
    assert [x["value"] for x in m28["figures"]] == [9.5, 32.9]
    assert m28["figures"][0]["source"]["page"] == 36 and m28["figures"][1]["source"]["page"] == 43
    claims = {c["id"]: c for c in json.loads((out / "claims.json").read_text())}
    assert "396.3" in claims["pensions"]["finding"] and "396.1" not in claims["pensions"]["finding"]
    assert "proposed budget" in claims["pensions"]["finding"]  # the 17.7% share is labelled as proposed-basis
    assert "June 8, 2026" in claims["trash-fee"]["finding"] and "tentative" not in claims["trash-fee"]["finding"]


def _break_flows(cur):
    flows = json.loads((cur / "flows.json").read_text())
    flows["links"][0]["target"] = "ghost"
    (cur / "flows.json").write_text(json.dumps(flows))


def test_build_all_failure_leaves_out_dir_untouched(tmp_path):
    import pytest
    out, _ = _build(tmp_path)
    before = {p.name: p.read_bytes() for p in out.iterdir()}
    _break_flows(tmp_path / "curated")
    with pytest.raises(ValueError, match="ghost"):
        build_all(FIX, tmp_path / "curated", out)
    assert {p.name: p.read_bytes() for p in out.iterdir()} == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["build", "curated"]  # no temp dirs left


def test_build_all_check_failure_leaves_out_dir_untouched(tmp_path):
    import pytest
    from pipeline.build import BuildCheckError
    out = tmp_path / "build"
    out.mkdir()
    (out / "series.json").write_text("old")
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    with pytest.raises(BuildCheckError) as err:
        build_all(FIX, cur, out, check=True)  # fixture CSVs have no FY2026 and no manifest
    assert err.value.failures
    assert [p.name for p in out.iterdir()] == ["series.json"] and (out / "series.json").read_text() == "old"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["build", "curated"]


def test_build_all_replaces_out_dir_on_success(tmp_path):
    out = tmp_path / "build"
    out.mkdir()
    (out / "stale.json").write_text("{}")
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    paths = build_all(FIX, cur, out)
    assert not (out / "stale.json").exists()
    assert all(p.parent == out and p.exists() for p in paths)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["build", "curated"]


def test_bike_card_links_to_how_projects_are_chosen(tmp_path):
    claims = {c["id"]: c for c in _claims_curated()}
    assert claims["bike-lanes"]["link"] == "#infrastructure"
    assert all("link" not in c for i, c in claims.items() if i != "bike-lanes")
    out, _ = _build(tmp_path)
    built = {c["id"]: c for c in json.loads((out / "claims.json").read_text())}
    assert built["bike-lanes"]["link"] == "#infrastructure"


def test_build_claims_rejects_a_link_that_is_not_an_anchor():
    import pytest
    from pipeline.build import build_claims
    bad = [{"id": "x", "claim": "c", "finding": "f.", "caveat": "c.", "chart": None, "link": "https://x.org",
            "sources": [{"doc": "d", "page": 1, "url": "https://x.org/a.pdf"}]}]
    with pytest.raises(ValueError, match=r"^claims\[0\]\.link"):
        build_claims(bad, [], {"gf_by_fy": {}, "gf_dept_by_fy": {}})


def test_methods_note_thresholds_match_the_pipeline():
    """The methods note (site/methods.js) states the tree's opening thresholds and category count; keep them in step."""
    import re
    from pipeline import budget_tree
    from pipeline.categories import EXPENSE_CATEGORIES
    js = (ROOT / "site" / "methods.js").read_text()
    m = re.search(r"export const RULES = (\{[^}]*\})", js)
    assert m, "site/methods.js must export RULES"
    rules = json.loads(re.sub(r"(\w+):", r'"\1":', m.group(1)))
    assert rules == {
        "categories": len(EXPENSE_CATEGORIES),
        "max_boxes": budget_tree.MAX_CHILDREN,
        "category_min_m": budget_tree.FUND_DEPT_CATEGORY_MIN_M,
        "account_min_m": budget_tree.ACCOUNT_LEVEL_MIN_M,
        "fold_below_m": budget_tree.OMIT_BELOW_M,
    }
