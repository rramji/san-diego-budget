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
    assert sorted(p.name for p in paths) == ["funnel.json", "headline.json", "series.json"]
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
