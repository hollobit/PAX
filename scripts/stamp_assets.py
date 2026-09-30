#!/usr/bin/env python3
"""site/의 JS·CSS 참조에 콘텐츠 해시(?v=)를 찍는다.

파일이 바뀌었는데 스탬프가 옛 값이면 브라우저 캐시 때문에 변경이 보이지 않는다
(2026-09-09 계기판 추가 때 실제 발생). 스탬프가 아예 없는 로컬 참조(`src="x.js"`,
`from './x.js'`)도 찍는다 — 예전에는 이미 ?v=가 붙은 참조만 고쳐서 한 번 빠진 파일은 영영 빠졌다.
사이트 자산을 고친 뒤 실행한다(pax.run post-collect의 마지막 단계).

    python3 scripts/stamp_assets.py          # 찍기
    python3 scripts/stamp_assets.py --check  # 확인만(빠진·옛 스탬프가 있으면 종료 코드 1, CI)
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"

# site/ 바로 아래 파일을 가리키는 로컬 참조만 다룬다(외부 주소·하위 폴더 경로는 대상이 아니다)
REF = re.compile(
    r"""(?P<pre>(?:src|href)="|from\s+'\./|import\(\s*'\./)"""
    r"""(?P<name>[\w.-]+\.(?:js|css))(?:\?v=(?P<v>[a-f0-9]+))?(?P<post>["'])""")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def _refs(text: str, site: Path):
    for m in REF.finditer(text):
        if (site / m.group("name")).exists():
            yield m


def stamp_file(path: Path, cache: dict[str, str], site: Path = SITE) -> bool:
    src = path.read_text(encoding="utf-8")

    def sub(m: re.Match) -> str:
        name = m.group("name")
        asset = site / name
        if not asset.exists():
            return m.group(0)
        new = cache.setdefault(name, digest(asset))
        if m.group("v") == new:
            return m.group(0)
        return f"{m.group('pre')}{name}?v={new}{m.group('post')}"

    out = REF.sub(sub, src)
    if out == src:
        return False
    path.write_text(out, encoding="utf-8")
    return True


def _targets(site: Path) -> list[Path]:
    return sorted(site.glob("*.js")) + sorted(site.glob("*.html"))


def stamp_all(site: Path = SITE) -> set[str]:
    # ES 모듈은 서로를 ?v=로 import한다(3D PAX). 모듈을 스탬프하면 그 모듈의 해시가 바뀌므로
    # 해시가 더 이상 변하지 않을 때까지 모듈 → HTML 순으로 반복한다.
    touched: set[str] = set()
    for _ in range(6):
        cache: dict[str, str] = {}
        changed = [p for p in _targets(site) if stamp_file(p, cache, site)]
        touched.update(p.name for p in changed)
        if not changed:
            break
    return touched


def find_problems(site: Path = SITE) -> list[str]:
    problems = []
    for path in _targets(site):
        for m in _refs(path.read_text(encoding="utf-8"), site):
            name, v = m.group("name"), m.group("v")
            if v is None:
                problems.append(f"{path.name}: {name} 스탬프 없음")
            elif v != digest(site / name):
                problems.append(f"{path.name}: {name} 옛 스탬프({v})")
    return problems


def main(argv: list[str]) -> int:
    if "--check" in argv:
        problems = find_problems()
        for p in problems:
            print(p, file=sys.stderr)
        print(f"스탬프 점검: 문제 {len(problems)}건")
        return 1 if problems else 0
    touched = stamp_all()
    for name in sorted(touched):
        print(f"{name} ← 스탬프 갱신")
    print(f"갱신 {len(touched)}개 파일")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
