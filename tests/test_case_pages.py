import json

import build_case_pages as bcp
from conftest import make_case


def _setup(tmp_path, monkeypatch, case):
    (tmp_path / "data").mkdir()
    (tmp_path / "site" / "data").mkdir(parents=True, exist_ok=True)
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


def _setup_full(tmp_path, monkeypatch, case, champions=None):
    (tmp_path / "site" / "data").mkdir(parents=True, exist_ok=True)
    (tmp_path / "site" / "data" / "champions.json").write_text(
        json.dumps({"champions": champions or []}, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "site" / "case-page.js").write_text("export {};\n", encoding="utf-8")
    return _setup(tmp_path, monkeypatch, case)


def test_live_slot_carries_case_id_and_collected_date(tmp_path, monkeypatch):
    page = _setup_full(tmp_path, monkeypatch, make_case())
    assert f'id="case-live" data-case-id="{"a" * 16}" data-collected-at="2026-08-06"' in page
    from stamp_assets import digest
    v = digest(tmp_path / "site" / "case-page.js")
    assert f'<script type="module" src="../case-page.js?v={v}"></script>' in page


def test_rank_file_has_only_popularity_inputs(tmp_path, monkeypatch):
    _setup_full(tmp_path, monkeypatch, make_case(popularity=120))
    rank = json.loads((tmp_path / "site" / "data" / "case-rank.json").read_text(encoding="utf-8"))
    assert rank["cases"] == [{"id": "a" * 16, "date": "2026-08-05", "collected_at": "2026-08-06",
                              "popularity": 120}]


def test_detail_rows_show_known_fields_only(tmp_path, monkeypatch):
    case = make_case(case_class="기관 공식", runtime_env="브라우저만", model_dependency="해외 상용 API",
                     models_used=["Gemini 2.5"], license="MIT", stars=42, maintenance="활발",
                     link_ok=True, health_checked="2026-10-05", popularity=150,
                     tags=["민원", "A&B"])
    page = _setup_full(tmp_path, monkeypatch, case)
    assert "<dt>사례 성격</dt><dd>기관 공식</dd>" in page
    assert "<dt>AI 모델</dt><dd>해외 상용 API — Gemini 2.5</dd>" in page
    assert "<dt>저장소</dt><dd>★ 42 · 유지보수 활발</dd>" in page
    assert "<dt>링크 점검</dt><dd>정상 (2026-10-05)</dd>" in page
    assert "<dt>출처 채널</dt><dd>Threads</dd>" in page
    assert '<a href="../?tag=A%26B">#A&amp;B</a>' in page
    assert "<dt>망 요건</dt>" not in page  # 값이 없는 항목은 줄을 만들지 않는다


def test_makers_link_to_champion_cards(tmp_path, monkeypatch):
    champs = [{"id": "github:foo", "name": "홍길동", "cases": ["a" * 16],
               "affiliation": {"value": "행정안전부"}},
              {"id": "gitlab:bar", "name": "다른사람", "cases": ["b" * 16]}]
    page = _setup_full(tmp_path, monkeypatch, make_case(), champs)
    assert '<a href="../champions.html#champ-github%3Afoo">홍길동</a> (행정안전부)' in page
    assert "다른사람" not in page
