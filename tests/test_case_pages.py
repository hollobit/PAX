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
