import json
from pathlib import Path

from pax.publish import sync_site_data


def test_sync_copies_and_creates_dirs(tmp_path):
    src = tmp_path / "data" / "cases.json"
    src.parent.mkdir()
    src.write_text(json.dumps({"updated_at": None, "cases": []}), encoding="utf-8")
    dst = tmp_path / "site" / "data" / "cases.json"
    sync_site_data(src, dst)
    assert dst.exists()
    assert dst.read_text(encoding="utf-8") == src.read_text(encoding="utf-8")


def test_sync_overwrites_existing_dst(tmp_path):
    src = tmp_path / "cases.json"
    src.write_text("new", encoding="utf-8")
    dst = tmp_path / "site" / "cases.json"
    dst.parent.mkdir()
    dst.write_text("old", encoding="utf-8")
    sync_site_data(src, dst)
    assert dst.read_text(encoding="utf-8") == "new"
