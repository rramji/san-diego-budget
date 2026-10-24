# San Diego Budget Explainer

A static web explainer of the City of San Diego General Fund structural deficit, built from the city's open budget data (seshat.datasd.org) and budget PDFs.

Fetch the raw CSVs with `python3 -I run.py fetch` (writes `data/raw/`, which is git-ignored). Rebuild the published JSON in `data/build/` and run the figure checks with `python3 -I run.py build`.

## Data vintage

Raw CSVs fetched at 2026-10-24T16:25:44+00:00 (UTC); see `data/raw/manifest.json` for per-file URLs and SHA-256 hashes.
