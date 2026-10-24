"""Schema validation for hand-transcribed (curated) figures.

Every curated number is a Figure: {"value": number, "source": Source}.
Money fields are suffixed _m and are in millions of dollars.
"""
import json
from pathlib import Path
from typing import TypedDict


class Source(TypedDict):
    doc: str
    page: int | None
    url: str


class Figure(TypedDict):
    value: float
    source: Source


def _is_number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def validate_figure(obj, path: str) -> None:
    if not isinstance(obj, dict):
        raise ValueError(f"{path}: figure must be an object")
    if not _is_number(obj.get("value")):
        raise ValueError(f"{path}: value must be a number, got {obj.get('value')!r}")
    src = obj.get("source")
    if not isinstance(src, dict):
        raise ValueError(f"{path}: missing source")
    for key in ("doc", "url"):
        v = src.get(key)
        if not isinstance(v, str) or not v.strip():
            raise ValueError(f"{path}: source.{key} must be a non-empty string")
    if not src["url"].startswith("https://"):
        raise ValueError(f"{path}: source.url must be an https url")
    page = src.get("page", None)
    if page is not None and (not isinstance(page, int) or isinstance(page, bool)):
        raise ValueError(f"{path}: source.page must be int or null, got {page!r}")


def _walk(node, path: str) -> None:
    if isinstance(node, dict):
        if "value" in node:
            validate_figure(node, path)
            return
        for k, v in node.items():
            _walk(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            _walk(v, f"{path}[{i}]")


def load(curated_dir: Path, name: str) -> dict:
    with open(Path(curated_dir) / f"{name}.json", encoding="utf-8") as f:
        data = json.load(f)
    _walk(data, "")
    return data
