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
        "claims.json", "cuts.json", "flows.json", "funnel.json", "gap.json", "glossary.json",
        "headline.json", "series.json", "structural_deficit.json"
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


def test_structural_deficit_merges_gf_expenditure(tmp_path):
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    base = {"one_time_resources_m": None, "one_time_expenditures_m": None,
            "suspended_reserve_m": None, "includes_suspended_reserve": False, "components": None,
            "resources_include_reserve": False,
            "basis": "proposed budget; gross one-time resources"}
    entries = [
        {"fy": 2013, "reported": False, "structural_deficit_m": None, **base,
         "note": "IBA report 12-16 not located online"},
        {"fy": 2023, "reported": True, "structural_deficit_m": _fig(38.3), **base, "note": "t"},
        {"fy": 2027, "reported": True, "structural_deficit_m": _fig(11.2), **base, "note": "t"},
    ]
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
    assert markers[2025]["label"] == "Nov 2024: sales tax measure fails"
    for fy in (2011, 2025, 2026):
        src = markers[fy]["source"]["source"]
        assert src["url"].startswith("https://") and src["page"] in (3, 77)
    assert markers[2028]["source"]["value"] == 30
    assert "kpbs.org" in markers[2028]["source"]["source"]["url"]


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
    assert len(col1) == 3
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
    assert 15 <= len(flows["links"]) <= 28
    hl = [l for l in flows["links"] if l["highlight"]]
    assert hl[0]["target"] == "bike_ped" and all(k in hl[0]["rule"] for k in ("bond proceeds", "TransNet", "day-to-day services"))
    assert "Active Transportation Program" not in hl[0]["rule"] and "never" not in hl[0]["rule"]


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
    for k in ("pre_cut_m", "post_cut_city_m", "post_cut_iba_m", "skipped_reserve_m",
              "fy2028_projection_m", "population", "households", "sales_tax_1pct_m"):
        assert gap[k]["value"] > 0 and gap[k]["source"]["url"].startswith("https://"), k
    assert round(gap["post_cut_city_m"]["value"] + gap["skipped_reserve_m"]["value"], 1) == gap["post_cut_iba_m"]["value"]


def test_curated_glossary_terms():
    import re
    gl = json.loads((CURATED / "glossary.json").read_text())
    terms = [g["term"] for g in gl]
    assert len(terms) == 5 and "General Fund" in terms
    for g in gl:
        assert len(re.split(r"(?<=[.!?])\s+", g["plain"].strip())) <= 2, g["term"]
