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


def stamp_file(path: Path, cache: dict[str, str]) -> bool:
    src = path.read_text(encoding="utf-8")

    def sub(m: re.Match) -> str:
        name, old = m.group(1), m.group(2)
        asset = SITE / name
        if not asset.exists():
            return m.group(0)
        new = cache.setdefault(name, digest(asset))
        return m.group(0) if new == old else f"{name}?v={new}"

    out = re.sub(r"([\w.-]+\.(?:js|css))\?v=([a-f0-9]+)", sub, src)
    if out == src:
        return False
    path.write_text(out, encoding="utf-8")
    return True


def main() -> int:
    # ES 모듈은 서로를 ?v=로 import한다(3D PAX). 모듈을 스탬프하면 그 모듈의 해시가 바뀌므로
    # 해시가 더 이상 변하지 않을 때까지 모듈 → HTML 순으로 반복한다.
    touched: set[str] = set()
    for _ in range(5):
        cache: dict[str, str] = {}
        changed = [p for p in sorted(SITE.glob("*.js")) + sorted(SITE.glob("*.html")) if stamp_file(p, cache)]
        touched.update(p.name for p in changed)
        if not changed:
            break
    for name in sorted(touched):
        print(f"{name} ← 스탬프 갱신")
    print(f"갱신 {len(touched)}개 파일")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
