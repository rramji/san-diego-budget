import json

import pytest

from pipeline import curated

GOOD = {"doc": "Doc", "page": 4, "url": "https://example.com/x.pdf"}


def fig(**over):
    src = {**GOOD, **over.pop("source", {})}
    return {"value": 1.5, "source": src, **over}


def test_validate_figure_accepts_good_and_null_page():
    curated.validate_figure(fig(), "a")
    curated.validate_figure(fig(source={"page": None}), "a")


def test_validate_figure_rejects_missing_url():
    f = fig()
    del f["source"]["url"]
    with pytest.raises(ValueError) as e:
        curated.validate_figure(f, "bar3.pension_adc_m")
    assert str(e.value).startswith("bar3.pension_adc_m")


def test_validate_figure_rejects_string_page():
    with pytest.raises(ValueError) as e:
        curated.validate_figure(fig(source={"page": "4"}), "bar3.pension_adc_m")
    assert str(e.value).startswith("bar3.pension_adc_m")


def test_validate_figure_rejects_non_numeric_value():
    for bad in ("396.1", None, True):
        f = fig()
        f["value"] = bad
        with pytest.raises(ValueError) as e:
            curated.validate_figure(f, "bar3.pension_adc_m")
        assert str(e.value).startswith("bar3.pension_adc_m")


def test_validate_figure_rejects_missing_doc():
    f = fig()
    del f["source"]["doc"]
    with pytest.raises(ValueError, match="^x"):
        curated.validate_figure(f, "x")


def test_load_walks_nested_figures(tmp_path):
    bad = fig()
    del bad["source"]["url"]
    data = {"fy": 2027, "a": {"b": [{"dept": "X", "amount_m": bad}]}}
    (tmp_path / "t.json").write_text(json.dumps(data))
    with pytest.raises(ValueError) as e:
        curated.load(tmp_path, "t")
    assert str(e.value).startswith("a.b[0].amount_m")


def test_load_returns_data(tmp_path):
    data = {"fy": 2027, "x": fig()}
    (tmp_path / "t.json").write_text(json.dumps(data))
    assert curated.load(tmp_path, "t") == data
