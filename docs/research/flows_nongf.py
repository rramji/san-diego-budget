"""Derive the non-General-Fund Sankey amounts from the cached open-data CSVs and write them into
data/curated/flows.json. Run: python3 -I docs/research/flows_nongf.py   (from the repo root).
Groupings are documented in docs/research/flows-sources.md."""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.bike_match import is_bike_project  # noqa: E402
from pipeline.csv_loader import EXPENSE_TYPES, load_budget_rows, load_cip_rows, select_cycle  # noqa: E402

RAW = ROOT / "data" / "raw"
OP_URL = "https://data.sandiego.gov/datasets/operating-budget/"
CIP_URL = "https://data.sandiego.gov/datasets/cip-fy-budget/"
CBO_URL = "https://www.sandiego.gov/sites/default/files/2026-08/fy27ab_v1cbo.pdf"
GRANTS_FY2027_M = 25.1  # Vol. I Citywide Budget Overview p.44, homelessness grants (printed)


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
    matched = [r for r in cip if is_bike_project(r["project_name"])]
    split = defaultdict(float)
    for r in matched:
        split[r["fund_type"]] += r["amount"] / 1e6
    return g, transnet, sorted({r["project_name"] for r in matched}), dict(split), sum(split.values())


def main():
    g, transnet, projects, split, bike = compute()
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
    bike_ref = ("FY2025 adopted CIP budget, City of San Diego open data (cip_budget.csv), projects: " + "; ".join(projects)
                + "; fund types: " + ", ".join(f"{k} ${v:.2f}M" for k, v in split.items()) + ". Other restricted flows are FY2026 operating or FY2027 grants; the data does not tie any grant to these projects")
    path = ROOT / "data" / "curated" / "flows.json"
    flows = json.loads(path.read_text(encoding="utf-8"))
    rest_in = sum(amounts[k][0] for k in ("grants", "gas_transnet", "hotel_setasides", "other_special"))
    out = {"bike_ped": (bike, bike_ref, CIP_URL), "roads": (gas, amounts["gas_transnet"][1], OP_URL),
           "convention_arts": (amounts["hotel_setasides"][0], amounts["hotel_setasides"][1], OP_URL),
           "other_programs": (rest_in - bike - gas - amounts["hotel_setasides"][0],
                              "Remainder of restricted inflow (grants and other special revenue funds, FY2026/FY2027 as listed on the inflow links) after the bike, roads and hotel-tax uses", OP_URL)}
    for l in flows["links"]:
        key = l["source"] if l["source"] in amounts else (l["target"] if l["source"] == "rule_utility" else None)
        if l["target"] == "rule_utility" or l["target"] == "rule_restricted":
            a, doc, url = amounts[l["source"]]
        elif l["source"] == "rule_restricted":
            a, doc, url = out[l["target"]]
        elif l["source"] == "rule_utility":
            a, doc, url = amounts["water_sewer_rates" if l["target"] == "water_sewer_sys" else "other_enterprise_fees"]
        else:
            continue
        l["amount_m"] = round(a, 1) if l["target"] != "bike_ped" else round(a, 2)
        l["ref"] = {"doc": doc, "page": CBO_PAGE if l["source"] == "grants" else None, "url": url}
    path.write_text(json.dumps(flows, indent=2, ensure_ascii=False), encoding="utf-8")
    return g, transnet, projects, split, bike, amounts, out


CBO_PAGE = 44

if __name__ == "__main__":
    g, transnet, projects, split, bike, amounts, out = main()
    for k, v in g.items():
        print(k, round(sum(v.values()), 1), {n: round(x, 1) for n, x in sorted(v.items(), key=lambda t: -t[1])})
    print("transnet cip", round(transnet, 2), "bike", round(bike, 2), projects, split)
