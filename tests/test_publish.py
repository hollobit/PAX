import json
import subprocess
import sys
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


def test_cli_success_copies_file(tmp_path):
    root = tmp_path
    (root / "data").mkdir()
    (root / "data" / "cases.json").write_text(
        json.dumps({"updated_at": None, "cases": []}), encoding="utf-8")
    scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
    result = subprocess.run(
        [sys.executable, "-m", "pax.publish"],
        cwd=root, capture_output=True, text=True,
        env={"PYTHONPATH": str(scripts_dir), "PATH": "/usr/bin:/bin"},
    )
    assert result.returncode == 0, result.stderr
    copied = root / "site" / "data" / "cases.json"
    assert copied.exists()
    assert copied.read_text(encoding="utf-8") == (root / "data" / "cases.json").read_text(encoding="utf-8")


def test_cli_error_missing_source(tmp_path):
    root = tmp_path
    scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
    result = subprocess.run(
        [sys.executable, "-m", "pax.publish"],
        cwd=root, capture_output=True, text=True,
        env={"PYTHONPATH": str(scripts_dir), "PATH": "/usr/bin:/bin"},
    )
    assert result.returncode != 0
    assert "Traceback" not in result.stderr
    assert "원본 없음" in result.stderr
