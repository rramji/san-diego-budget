"""Download the City of San Diego budget CSVs into data/raw/ with a manifest."""
import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCES = {
    "operating_budget": "https://seshat.datasd.org/operating_budget/budget_operating_datasd.csv",
    "operating_actuals": "https://seshat.datasd.org/operating_actuals/actuals_operating_datasd.csv",
    "cip_budget": "https://seshat.datasd.org/cip_fy_budget/budget_capital_fy_datasd.csv",
    "cip_actuals": "https://seshat.datasd.org/cip_fy_actuals/actuals_capital_fy_datasd.csv",
    "ref_accounts": "https://seshat.datasd.org/accounts_city_budget/budget_reference_accounts_datasd.csv",
    "ref_depts": "https://seshat.datasd.org/departments_city_budget/budget_reference_depts_datasd.csv",
    "ref_funds": "https://seshat.datasd.org/funds_city_budget/budget_reference_funds_datasd.csv",
    "ref_projects": "https://seshat.datasd.org/projects_city_budget/budget_reference_projects_datasd.csv",
}

CHUNK = 1024 * 1024


def fetch_all(raw_dir, sources=SOURCES, opener=urllib.request.urlopen):
    """Download each source to raw_dir/<name>.csv; return {name: sha256}."""
    raw_dir = Path(raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, url in sources.items():
        sha = hashlib.sha256()
        size = 0
        with opener(url) as resp, open(raw_dir / f"{name}.csv", "wb") as out:
            while chunk := resp.read(CHUNK):
                sha.update(chunk)
                size += len(chunk)
                out.write(chunk)
        manifest[name] = {
            "url": url,
            "sha256": sha.hexdigest(),
            "bytes": size,
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    (raw_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return {name: m["sha256"] for name, m in manifest.items()}


if __name__ == "__main__":
    for name, digest in fetch_all(Path("data/raw")).items():
        print(f"{name}: {digest}")
