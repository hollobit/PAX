#!/usr/bin/env python3
"""사이트 상단 메뉴를 한 곳(NAV)에서 관리한다 — 각 페이지의 <nav class="site-nav">를 이 목록으로 다시 쓴다.

빌드 단계가 없는 정적 사이트라 메뉴가 HTML 12개에 복사돼 있었다. 메뉴를 하나 더하려면 12곳을 고쳐야 했고,
한 곳만 빠뜨려도 페이지마다 메뉴가 달라진다. 이제 NAV만 고치고 이 스크립트를 돌린다(pax.run에도 들어 있다).
정적 HTML에 그대로 적히므로 스크립트 없이도 메뉴가 보이고 검색엔진도 읽는다.

    python3 scripts/sync_nav.py      # 바뀐 페이지만 다시 쓴다
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"

NAV: tuple[tuple[str, str], ...] = (
    ("./", "사례 아카이브"),
    ("pax3d.html", "3D PAX"),
    ("dashboard.html", "AX 평가"),
    ("champions.html", "챔피언"),
    ("ax-maturity-infographic.html", "AX 성숙도 개념"),
    ("observatory.html", "관측소"),
    ("gap-map.html", "격차 지도"),
    ("mcp-review.html", "MCP 검증"),
    ("playbook.html", "전이 플레이북"),
    ("guidelines.html", "안내서·가이드라인"),
    ("videos.html", "공유 동영상"),
    ("news.html", "공유 뉴스"),
    ("changelog.html", "변경 기록"),
)

NAV_BLOCK = re.compile(r'(?P<indent>[ \t]*)<nav class="site-nav"[^>]*>.*?</nav>', re.S)


def render_nav(page_name: str, indent: str = "    ") -> str:
    current = "./" if page_name == "index.html" else page_name
    links = []
    for href, label in NAV:
        mark = ' aria-current="page"' if href == current else ""
        links.append(f'{indent}  <a href="{href}"{mark}>{label}</a>')
    return f'{indent}<nav class="site-nav" aria-label="주요 메뉴">\n' + "\n".join(links) + f"\n{indent}</nav>"


def _synced(text: str, page_name: str) -> str:
    return NAV_BLOCK.sub(lambda m: render_nav(page_name, m.group("indent")), text, count=1)


def needs_sync(page: Path) -> bool:
    text = page.read_text(encoding="utf-8")
    return bool(NAV_BLOCK.search(text)) and _synced(text, page.name) != text


def sync_page(page: Path) -> bool:
    text = page.read_text(encoding="utf-8")
    if not NAV_BLOCK.search(text):
        return False
    new = _synced(text, page.name)
    if new == text:
        return False
    page.write_text(new, encoding="utf-8")
    return True


def main() -> int:
    changed = [p.name for p in sorted(SITE.glob("*.html")) if sync_page(p)]
    print(f"메뉴 동기화: {len(changed)}개 페이지 갱신" + (f" ({', '.join(changed)})" if changed else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
