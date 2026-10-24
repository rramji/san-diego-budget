"""Canonical keyword matchers for capital (CIP) project names.

Used by the claim checker and by docs/research/flows_nongf.py so both count the same projects.
"""
import re

_BIKE = re.compile(r"bike|bicycle|cycle track|active transportation|pedestrian", re.I)
_ROAD = re.compile(
    r"street resurfacing|resurfacing|slurry seal|pavement|pothole|street repair|\broad\b", re.I
)
# "X Road Improvements" CIP projects are new road construction/widening, not repair.
_ROAD_EXCLUDE = re.compile(r"\broad improvements\b", re.I)


def is_bike_project(name: str) -> bool:
    return bool(_BIKE.search(name)) and "motorcycle" not in name.lower()


def is_road_repair(name: str) -> bool:
    return bool(_ROAD.search(name)) and not _ROAD_EXCLUDE.search(name)
