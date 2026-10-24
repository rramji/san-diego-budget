import hashlib
import io
import json

from pipeline.fetch import fetch_all

PAYLOAD = b"a,b\n1,2\n"


def test_fetch_all_writes_files_and_manifest(tmp_path):
    sources = {"one": "http://example.test/one.csv", "two": "http://example.test/two.csv"}
    result = fetch_all(tmp_path, sources, opener=lambda url: io.BytesIO(PAYLOAD))
    digest = hashlib.sha256(PAYLOAD).hexdigest()
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert set(manifest) == {"one", "two"}
    for name in sources:
        assert (tmp_path / f"{name}.csv").read_bytes() == PAYLOAD
        assert manifest[name]["sha256"] == digest
        assert manifest[name]["bytes"] == len(PAYLOAD)
        assert manifest[name]["url"] == sources[name]
        assert manifest[name]["fetched_at"]
        assert result[name] == digest
