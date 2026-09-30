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
    # 사본은 보강 산출물 — 바이트 동일이 아니라 데이터 동일을 보장한다
    assert json.loads(dst.read_text(encoding="utf-8")) == json.loads(src.read_text(encoding="utf-8"))


def test_sync_overwrites_existing_dst(tmp_path):
    src = tmp_path / "cases.json"
    src.write_text(json.dumps({"cases": [{"id": "fresh"}]}), encoding="utf-8")
    dst = tmp_path / "site" / "cases.json"
    dst.parent.mkdir()
    dst.write_text("old", encoding="utf-8")
    sync_site_data(src, dst)
    assert json.loads(dst.read_text(encoding="utf-8"))["cases"][0]["id"] == "fresh"


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
    assert (json.loads(copied.read_text(encoding="utf-8"))
            == json.loads((root / "data" / "cases.json").read_text(encoding="utf-8")))


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


def test_thumb_version_stamped(tmp_path):
    """site 사본의 사례에 썸네일 mtime이 thumb_v로 찍힌다 — 캐시 무효화용."""
    import json, os
    from pax.publish import sync_site_data
    src = tmp_path / "cases.json"
    thumbs = tmp_path / "thumbs"; thumbs.mkdir()
    src.write_text(json.dumps({"cases": [{"id": "abc"}, {"id": "nothumb"}]}), encoding="utf-8")
    (thumbs / "abc.jpg").write_bytes(b"x")
    os.utime(thumbs / "abc.jpg", (1724650000, 1724650000))
    dst = tmp_path / "site" / "cases.json"
    sync_site_data(src, dst, thumbs_dir=thumbs)
    out = json.loads(dst.read_text(encoding="utf-8"))
    assert out["cases"][0]["thumb_v"] == 1724650000
    assert "thumb_v" not in out["cases"][1]


def test_lite_copy_keeps_only_listing_fields(tmp_path):
    """챔피언·갭맵·플레이북은 id·제목·기관·유형·지역만 읽는다 — 경량판에 그만 담는다."""
    from pax.publish import LITE_FIELDS, write_lite
    doc = {"updated_at": "2026-09-30T00:00:00+09:00", "cases": [
        {"id": "a", "title": "T", "org": "O", "org_type": "기초지자체", "region": "광주",
         "summary": "긴 요약", "link": "https://x", "tags": ["t"]},
        {"id": "b", "title": "U", "org": "P", "org_type": "커뮤니티"},  # region 없는 사례
    ]}
    dst = tmp_path / "cases-lite.json"
    write_lite(doc, dst)
    out = json.loads(dst.read_text(encoding="utf-8"))
    assert out["updated_at"] == doc["updated_at"]
    assert out["cases"][0] == {"id": "a", "title": "T", "org": "O", "org_type": "기초지자체", "region": "광주"}
    assert "region" not in out["cases"][1]
    assert set(LITE_FIELDS) == {"id", "title", "org", "org_type", "region"}
    assert doc["cases"][0]["summary"] == "긴 요약"  # 원본 문서는 건드리지 않는다


def test_cli_writes_lite_next_to_full_copy(tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "cases.json").write_text(
        json.dumps({"cases": [{"id": "a", "title": "T", "org": "O", "org_type": "커뮤니티", "summary": "s"}]}),
        encoding="utf-8")
    scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
    result = subprocess.run([sys.executable, "-m", "pax.publish"], cwd=tmp_path, capture_output=True,
                            text=True, env={"PYTHONPATH": str(scripts_dir), "PATH": "/usr/bin:/bin"})
    assert result.returncode == 0, result.stderr
    lite = json.loads((tmp_path / "site" / "data" / "cases-lite.json").read_text(encoding="utf-8"))
    assert lite["cases"] == [{"id": "a", "title": "T", "org": "O", "org_type": "커뮤니티"}]
