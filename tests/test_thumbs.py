import os

from PIL import Image

from pax.thumbs import WEBP_WIDTH, sync_webp


def _jpg(path, size=(640, 400), color=(200, 120, 40)):
    Image.new("RGB", size, color).save(path, "JPEG", quality=75)


def test_creates_webp_for_each_jpg_at_display_width(tmp_path):
    _jpg(tmp_path / "a.jpg")
    _jpg(tmp_path / "b.jpg")
    made, kept = sync_webp(tmp_path)
    assert (made, kept) == (2, 0)
    with Image.open(tmp_path / "a.webp") as im:
        assert im.format == "WEBP"
        assert im.width == WEBP_WIDTH
        assert im.height == round(400 * WEBP_WIDTH / 640)  # 비율 유지


def test_skips_up_to_date_webp(tmp_path):
    _jpg(tmp_path / "a.jpg")
    sync_webp(tmp_path)
    made, kept = sync_webp(tmp_path)
    assert (made, kept) == (0, 1)


def test_regenerates_when_jpg_is_newer(tmp_path):
    # make_thumbs.sh가 썸네일을 다시 찍으면 WebP도 따라가야 한다
    _jpg(tmp_path / "a.jpg")
    sync_webp(tmp_path)
    webp = tmp_path / "a.webp"
    old = webp.stat().st_mtime
    os.utime(webp, (old - 100, old - 100))
    _jpg(tmp_path / "a.jpg", color=(10, 10, 10))
    made, _ = sync_webp(tmp_path)
    assert made == 1


def test_removes_orphan_webp(tmp_path):
    # JPEG가 지워진 사례(보강 절차의 썸네일 재생성)에서 옛 WebP가 남으면 옛 화면이 보인다
    _jpg(tmp_path / "a.jpg")
    sync_webp(tmp_path)
    (tmp_path / "a.jpg").unlink()
    sync_webp(tmp_path)
    assert not (tmp_path / "a.webp").exists()


def test_does_not_upscale_small_images(tmp_path):
    _jpg(tmp_path / "small.jpg", size=(300, 200))
    sync_webp(tmp_path)
    with Image.open(tmp_path / "small.webp") as im:
        assert im.width == 300


def test_ignores_non_jpg_entries(tmp_path):
    (tmp_path / ".claude").mkdir()
    (tmp_path / "note.txt").write_text("x")
    _jpg(tmp_path / "a.jpg")
    made, kept = sync_webp(tmp_path)
    assert (made, kept) == (1, 0)


def test_convert_failure_leaves_no_tmp(tmp_path, monkeypatch):
    _jpg(tmp_path / "a.jpg")

    def boom(self, fp, *a, **k):
        # 반쯤 쓰다가 실패하는 경우를 흉내 낸다
        from pathlib import Path
        Path(fp).write_bytes(b"partial")
        raise OSError("disk full")
    monkeypatch.setattr(Image.Image, "save", boom)
    import pytest
    with pytest.raises(OSError):
        sync_webp(tmp_path)
    assert not list(tmp_path.glob("*.tmp"))
    assert not (tmp_path / "a.webp").exists()


def test_repository_thumbs_all_have_webp():
    # <picture>는 WebP가 없어도 JPEG로 물러나지 않는다 — 짝 없는 JPEG는 곧 깨진 카드다
    from pathlib import Path
    thumbs = Path(__file__).resolve().parent.parent / "site" / "thumbs"
    missing = sorted(p.name for p in thumbs.glob("*.jpg") if not p.with_suffix(".webp").exists())
    assert not missing, f"WebP 없는 썸네일: {missing[:5]} — `PYTHONPATH=scripts python3 -m pax.thumbs` 실행"


def test_publish_cli_syncs_webp(tmp_path):
    import json, subprocess, sys
    from pathlib import Path
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "cases.json").write_text(json.dumps({"cases": [{"id": "a"}]}), encoding="utf-8")
    (tmp_path / "site" / "thumbs").mkdir(parents=True)
    _jpg(tmp_path / "site" / "thumbs" / "a.jpg")
    scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
    r = subprocess.run([sys.executable, "-m", "pax.publish"], cwd=tmp_path, capture_output=True, text=True,
                       env={"PYTHONPATH": str(scripts_dir), "PATH": "/usr/bin:/bin"})
    assert r.returncode == 0, r.stderr
    assert (tmp_path / "site" / "thumbs" / "a.webp").exists()
