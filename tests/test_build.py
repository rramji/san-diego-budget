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
        "funnel.json", "headline.json", "series.json", "structural_deficit.json"
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
    assert markers[2025]["label"] == "Nov 2024: one-cent sales tax (Measure E) fails"
    assert markers[2028]["source"]["value"] == 30
    assert "kpbs.org" in markers[2028]["source"]["source"]["url"]


def test_structural_deficit_rejects_unsourced_figure(tmp_path):
    cur = tmp_path / "curated"
    shutil.copytree(CURATED, cur)
    (cur / "structural_deficit.json").write_text(json.dumps(
        [{"fy": 2020, "reported": True, "structural_deficit_m": {"value": 5}, "basis": "x", "note": ""}]))
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


def test_curated_structural_deficit_covers_2012_2027_with_basis():
    from pipeline import curated
    years = curated.load(CURATED, "structural_deficit")
    assert [e["fy"] for e in years] == list(range(2012, 2028))
    for e in years:
        assert e["basis"] == ("proposed budget; gross one-time resources" if e["fy"] <= 2021
                              else "adopted budget; net of one-time expenditures")
        assert (e["structural_deficit_m"] is None) == (not e["reported"])
