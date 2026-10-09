import json

import build_case_pages as bcp
from conftest import make_case


def _setup(tmp_path, monkeypatch, case):
    (tmp_path / "data").mkdir()
    (tmp_path / "site" / "data").mkdir(parents=True)
    (tmp_path / "data" / "cases.json").write_text(json.dumps({"cases": [case]}, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "site" / "data" / "evaluations.json").write_text(json.dumps({"cases": []}), encoding="utf-8")
    (tmp_path / "site" / "style.css").write_text("body{}\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    bcp.main()
    return (tmp_path / "site" / "case" / f"{case['id']}.html").read_text(encoding="utf-8")


def test_page_has_shared_menu_and_stamped_stylesheet(tmp_path, monkeypatch):
    page = _setup(tmp_path, monkeypatch, make_case())
    from stamp_assets import digest
    assert f'href="../style.css?v={digest(tmp_path / "site" / "style.css")}"' in page
    assert '<a href="../news.html">공유 뉴스</a>' in page
    assert 'site-nav--external' in page


def test_non_https_addresses_never_become_links(tmp_path, monkeypatch):
    # 손으로 보강한 원장에 javascript: 주소가 들어와도 공개 페이지에서 링크가 되면 안 된다
    case = make_case(source="kakao", link="javascript:alert(1)", case_url="javascript:alert(2)")
    page = _setup(tmp_path, monkeypatch, case)
    assert "javascript:" not in page


def test_text_fields_are_escaped(tmp_path, monkeypatch):
    page = _setup(tmp_path, monkeypatch, make_case(title='<img src=x onerror=alert(1)>'))
    assert "<img src=x" not in page and "&lt;img" in page


def test_safe_href():
    assert bcp.safe_href("https://a.example/") == "https://a.example/"
    for bad in ("http://a.example/", "javascript:alert(1)", None, 3):
        assert bcp.safe_href(bad) is None


def _setup_with_thumb(tmp_path, monkeypatch, case, webp=True):
    thumbs = tmp_path / "site" / "thumbs"
    thumbs.mkdir(parents=True)
    (thumbs / f"{case['id']}.jpg").write_bytes(b"jpg")
    if webp:
        (thumbs / f"{case['id']}.webp").write_bytes(b"webp")
    return _setup(tmp_path, monkeypatch, case), thumbs


def test_page_shows_thumbnail_with_webp_and_og_image(tmp_path, monkeypatch):
    case = make_case(case_url="https://svc.example/")
    page, thumbs = _setup_with_thumb(tmp_path, monkeypatch, case)
    v = int((thumbs / f"{case['id']}.jpg").stat().st_mtime)
    assert f'srcset="../thumbs/{case["id"]}.webp?v={v}"' in page
    assert f'src="../thumbs/{case["id"]}.jpg?v={v}"' in page
    assert 'width="640" height="400"' in page
    assert f'<meta property="og:image" content="{bcp.BASE}/thumbs/{case["id"]}.jpg?v={v}">' in page
    assert 'class="case-page__thumb" href="https://svc.example/" target="_blank"' in page


def test_page_without_webp_uses_jpg_only(tmp_path, monkeypatch):
    case = make_case()
    page, _ = _setup_with_thumb(tmp_path, monkeypatch, case, webp=False)
    assert ".webp" not in page and f'../thumbs/{case["id"]}.jpg' in page


def test_page_without_thumbnail_has_no_figure(tmp_path, monkeypatch):
    page = _setup(tmp_path, monkeypatch, make_case())
    assert "case-page__thumb" not in page and "og:image" not in page
