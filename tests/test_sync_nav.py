from pathlib import Path

import sync_nav

SITE = Path(__file__).resolve().parent.parent / "site"


def test_render_marks_only_current_page():
    html = sync_nav.render_nav("champions.html")
    assert html.count('aria-current="page"') == 1
    assert '<a href="champions.html" aria-current="page">챔피언</a>' in html
    assert sync_nav.render_nav("index.html").count('<a href="./" aria-current="page">') == 1


def test_sync_replaces_whole_nav_block_and_is_idempotent(tmp_path):
    page = tmp_path / "news.html"
    page.write_text('<body>\n    <nav class="site-nav" aria-label="주요 메뉴">\n      <a href="./">옛 메뉴</a>\n    </nav>\n</body>\n',
                    encoding="utf-8")
    assert sync_nav.sync_page(page) is True
    text = page.read_text(encoding="utf-8")
    assert "옛 메뉴" not in text and "공유 뉴스" in text
    assert sync_nav.sync_page(page) is False  # 두 번째는 바꿀 것이 없다


def test_repository_pages_are_in_sync():
    # 메뉴는 sync_nav.NAV 한 곳이 정본 — 손으로 고친 페이지가 있으면 여기서 걸린다
    stale = [p.name for p in sorted(SITE.glob("*.html")) if sync_nav.needs_sync(p)]
    assert not stale, f"메뉴가 다른 페이지: {stale} — python3 scripts/sync_nav.py 실행"


def test_every_nav_target_exists():
    for href, _ in sync_nav.NAV:
        assert (SITE / ("index.html" if href == "./" else href)).exists(), href


def test_case_pages_use_the_same_menus_with_parent_prefix():
    # 사례 페이지(site/case/*.html)는 한 단계 아래라 '../'를 붙인 같은 메뉴를 쓴다
    html = sync_nav.render_nav("case", prefix="../")
    assert '<a href="../">사례 아카이브</a>' in html and '<a href="../news.html">공유 뉴스</a>' in html
    assert 'aria-current' not in html
    import build_case_pages
    assert sync_nav.render_nav("case", "    ", "../") in build_case_pages.TEMPLATE.replace("{{", "{").replace("}}", "}") \
        or "{nav}" in build_case_pages.TEMPLATE


def test_external_menu_is_single_sourced():
    ext = sync_nav.render_external("    ")
    assert ext.count('target="_blank" rel="noopener"') == len(sync_nav.EXTERNAL)
    stale = [p.name for p in sorted(SITE.glob("*.html")) if sync_nav.needs_sync(p)]
    assert not stale
