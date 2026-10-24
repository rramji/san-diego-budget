"""Derive the non-General-Fund Sankey amounts from the cached open-data CSVs and write them into
data/curated/flows.json. Hard-codes the years: FY2026 operating budget, FY2025 adopted CIP (bump both
when the CSVs gain a newer adopted year). Run: python3 -I docs/research/flows_nongf.py   (from the repo root).
Groupings are documented in docs/research/flows-sources.md."""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.bike_match import is_bike_project, is_road_repair  # noqa: E402
from pipeline.csv_loader import EXPENSE_TYPES, load_budget_rows, load_cip_rows, select_cycle  # noqa: E402

RAW = ROOT / "data" / "raw"
OP_URL = "https://data.sandiego.gov/datasets/operating-budget/"
CIP_URL = "https://data.sandiego.gov/datasets/cip-fy-budget/"
CBO_URL = "https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1cbo.pdf"
GRANTS_FY2027_M = 25.1  # Vol. I Citywide Budget Overview p.44, homelessness grants (printed)


BOND = "Bond Financing"
RULES = {
    ("bonds", "rule_capital"): "Bond proceeds are borrowed money. They can only pay for capital projects the city chooses (building or rebuilding things such as streets and bikeways), not for day-to-day services.",
    ("rule_capital", "bike_ped"): "The Council directed borrowed money to this project. It could have gone to roads or other capital projects the city chooses, but not to day-to-day services like police, parks or libraries.",
    ("rule_capital", "roads"): "The Council directed borrowed money to repaving city streets. Like all bond money, it could only go to capital projects the city chooses, not to day-to-day services.",
    ("rule_restricted", "bike_ped"): "TransNet (a voter-approved regional sales tax that can only fund transportation) paid for a small part of these projects.",
    ("rule_restricted", "roads"): "TransNet sales tax and fees charged for digging up streets (trench-cut fees) can only be spent on streets and transportation.",
}
NEW_NODES = [
    ({"id": "bonds", "label": "Bonds (borrowed for capital projects)", "column": 0, "kind": "borrowed"}, "other_special"),
    ({"id": "rule_capital", "label": "Borrowed money: capital projects the Council picks", "column": 1, "kind": "borrowed"}, "gf_decides"),
]


def compute():
    names = {r["fund_number"]: r["fund_name"] for r in csv.DictReader(open(RAW / "ref_funds.csv", encoding="utf-8"))}
    op = [r for r in select_cycle(load_budget_rows(RAW)) if r["fy"] == 2026 and r["account_type"] in EXPENSE_TYPES]
    by_fund = defaultdict(float)
    for r in op:
        if r["fund_type"] in ("Enterprise Funds", "Special Revenue Funds"):
            by_fund[(r["fund_type"], names.get(r["fund_number"], r["fund_number"]))] += r["amount"] / 1e6
    g = {"water_sewer": {}, "other_ent": {}, "gas": {}, "hotel": {}, "other_special": {}}
    for (ft, nm), v in by_fund.items():
        low = nm.lower()
        if ft == "Enterprise Funds":
            g["water_sewer" if ("water" in low or "sewer" in low) else "other_ent"][nm] = v
        elif "gas tax" in low or "road maintenance" in low or "transnet" in low:
            g["gas"][nm] = v
        elif "transient occupancy" in low or "convention" in low or "petco" in low:
            g["hotel"][nm] = v
        else:
            g["other_special"][nm] = v
    cip = [r for r in select_cycle(load_cip_rows(RAW)) if r["fy"] == 2025]
    transnet = sum(r["amount"] for r in cip if "transnet" in r["fund_type"].lower()) / 1e6
    # Same bucketing as the claim card (pipeline/build.py _bike_chart): a project matching both counts as bike.
    matched = [r for r in cip if is_bike_project(r["project_name"])]
    roads = [r for r in cip if not is_bike_project(r["project_name"]) and is_road_repair(r["project_name"])]
    split, road_split = defaultdict(float), defaultdict(float)
    for r in matched:
        split[r["fund_type"]] += r["amount"] / 1e6
    for r in roads:
        road_split[r["fund_type"]] += r["amount"] / 1e6
    return g, transnet, sorted({r["project_name"] for r in matched}), dict(split), dict(road_split)


def _ensure_graph(flows):
    """Insert the bond source and capital-projects rule nodes and their links if a re-run starts from an older file."""
    ids = [n["id"] for n in flows["nodes"]]
    for node, after in NEW_NODES:
        if node["id"] not in ids:
            flows["nodes"].insert(ids.index(after) + 1, node)
            ids = [n["id"] for n in flows["nodes"]]
    have = {(l["source"], l["target"]) for l in flows["links"]}
    for key in (("bonds", "rule_capital"), ("rule_capital", "bike_ped"), ("rule_capital", "roads")):
        if key not in have:
            flows["links"].append({"source": key[0], "target": key[1], "amount_m": 0, "rule": "", "ref": {}, "highlight": False})
    for l in flows["links"]:
        l["highlight"] = (l["source"], l["target"]) == ("rule_capital", "bike_ped")
        if (l["source"], l["target"]) in RULES:
            l["rule"] = RULES[(l["source"], l["target"])]


def main():
    g, transnet, projects, split, road_split = compute()
    tot = {k: sum(v.values()) for k, v in g.items()}
    gas = tot["gas"] + transnet
    ops = "FY2026 adopted operating budget, City of San Diego open data CSV (budget_operating_datasd.csv), funds: "
    amounts = {
        "water_sewer_rates": (tot["water_sewer"], ops + ", ".join(sorted(g["water_sewer"])) + " (FY2026; GF side of the graph is FY2027)", OP_URL),
        "other_enterprise_fees": (tot["other_ent"], ops + ", ".join(sorted(g["other_ent"])) + " (FY2026)", OP_URL),
        "grants": (GRANTS_FY2027_M, "FY2027 Adopted Budget Vol. I Citywide Budget Overview: $25.1M homelessness grant funding (the only grant total printed; other grants not itemized)", CBO_URL),
        "gas_transnet": (gas, ops + ", ".join(sorted(g["gas"])) + f" (FY2026) plus FY2025 adopted CIP TransNet Funds ${transnet:.1f}M (cip_budget.csv)", OP_URL),
        "hotel_setasides": (tot["hotel"], ops + ", ".join(sorted(g["hotel"])) + " (FY2026)", OP_URL),
        "other_special": (tot["other_special"], ops + "all other Special Revenue Funds (FY2026; list in docs/research/flows-sources.md)", OP_URL),
    }
    cip = "FY2025 adopted CIP budget, City of San Diego open data (cip_budget.csv), "
    fmt = lambda d: ", ".join(f"{k} ${v:.3f}M" for k, v in sorted(d.items(), key=lambda t: -t[1]))
    bike_bond = split.get(BOND, 0.0)
    road_bond = road_split.get(BOND, 0.0)
    bike_rest = sum(v for k, v in split.items() if k != BOND)
    road_rest = sum(v for k, v in road_split.items() if k != BOND)
    nonbond = lambda d: {k: v for k, v in d.items() if k != BOND}
    bike_doc = cip + "bike and pedestrian projects (" + "; ".join(projects) + "), "
    road_doc = cip + "road repair projects (names matching pipeline/bike_match.py is_road_repair, e.g. Resurfacing of City Streets), "
    amounts["bonds"] = (bike_bond + road_bond, cip + f"Bond Financing on the bike and pedestrian projects (${bike_bond:.2f}M) and road repair projects (${road_bond:.2f}M) shown here only; bonds for other capital projects are not drawn", CIP_URL)
    path = ROOT / "data" / "curated" / "flows.json"
    flows = json.loads(path.read_text(encoding="utf-8"))
    _ensure_graph(flows)
    rest_in = sum(amounts[k][0] for k in ("grants", "gas_transnet", "hotel_setasides", "other_special"))
    restricted_out = {
        "bike_ped": (bike_rest, bike_doc + "non-bond fund types: " + fmt(nonbond(split)) + ". The data does not tie any grant to these projects", CIP_URL),
        "roads": (road_rest, road_doc + "non-bond fund types: " + fmt(nonbond(road_split)), CIP_URL),
        "convention_arts": (amounts["hotel_setasides"][0], amounts["hotel_setasides"][1], OP_URL),
        "other_programs": (rest_in - bike_rest - road_rest - amounts["hotel_setasides"][0],
                           "Remainder of restricted inflow (grants and other special revenue funds, FY2026/FY2027 as listed on the inflow links) after the bike, road-repair and hotel-tax uses; it includes the FY2026 Gas Tax and Road Maintenance and Rehabilitation operating funds, which pay for street work outside the capital projects drawn here", OP_URL),
    }
    capital_out = {
        "bike_ped": (bike_bond, bike_doc + f"Bond Financing ${bike_bond:.2f}M", CIP_URL),
        "roads": (road_bond, road_doc + f"Bond Financing ${road_bond:.3f}M", CIP_URL),
    }
    for l in flows["links"]:
        src, tgt = l["source"], l["target"]
        if tgt in ("rule_utility", "rule_restricted", "rule_capital"):
            a, doc, url = amounts[src]
        elif src == "rule_restricted":
            a, doc, url = restricted_out[tgt]
        elif src == "rule_capital":
            a, doc, url = capital_out[tgt]
        elif src == "rule_utility":
            a, doc, url = amounts["water_sewer_rates" if tgt == "water_sewer_sys" else "other_enterprise_fees"]
        else:
            continue
        cip_link = url == CIP_URL
        l["amount_m"] = round(a, 3) if cip_link else round(a, 1)
        l["ref"] = {"doc": doc, "page": CBO_PAGE if src == "grants" else None, "url": url}
    path.write_text(json.dumps(flows, indent=2, ensure_ascii=False), encoding="utf-8")
    return g, transnet, projects, split, road_split, amounts


CBO_PAGE = 44

if __name__ == "__main__":
    g, transnet, projects, split, road_split, amounts = main()
    for k, v in g.items():
        print(k, round(sum(v.values()), 1), {n: round(x, 1) for n, x in sorted(v.items(), key=lambda t: -t[1])})
    print("transnet cip", round(transnet, 2), "bike", projects, {k: round(v, 3) for k, v in split.items()})
    print("road repair", {k: round(v, 3) for k, v in road_split.items()}, "bonds", round(amounts["bonds"][0], 3))
