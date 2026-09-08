#!/usr/bin/env python3
"""site/*.html의 JS·CSS 참조에 콘텐츠 해시(?v=)를 갱신한다.

파일이 바뀌었는데 스탬프가 옛 값이면 브라우저 캐시 때문에 변경이 보이지 않는다
(2026-09-09 계기판 추가 때 실제 발생). 사이트 자산을 고친 뒤 항상 실행한다.
사용법: python3 scripts/stamp_assets.py
"""
import hashlib
import re
from pathlib import Path

SITE = Path("site")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def main() -> int:
    cache: dict[str, str] = {}
    changed = 0
    for html in sorted(SITE.glob("*.html")):
        src = html.read_text(encoding="utf-8")

        def sub(m: re.Match) -> str:
            name, old = m.group(1), m.group(2)
            asset = SITE / name
            if not asset.exists():
                return m.group(0)
            new = cache.setdefault(name, digest(asset))
            return m.group(0) if new == old else f"{name}?v={new}"

        out = re.sub(r"([\w.-]+\.(?:js|css))\?v=([a-f0-9]+)", sub, src)
        if out != src:
            html.write_text(out, encoding="utf-8")
            changed += 1
            print(f"{html.name} ← 스탬프 갱신")
    print(f"갱신 {changed}개 파일 / 자산 {len(cache)}종")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
