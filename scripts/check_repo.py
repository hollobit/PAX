#!/usr/bin/env python3
"""공개 저장소 지킴이 — CI(.github/workflows/ci.yml)와 커밋 전에 돌린다.

1. 비공개 경로(AGENTS.md §2의 .gitignore 항목)가 추적되고 있지 않은가
2. 스크립트·사이트 코드에 채팅방 ID 같은 15자리 이상 숫자 상수가 박혀 있지 않은가
   (카카오 채팅방 ID가 공개 스크립트에 두 번 들어간 적이 있다 — 이제는 data/state.json에서 읽는다)
3. Supabase service_role 키가 들어 있지 않은가(anon 키는 공개용이라 허용)
4. 사이트·원장 JSON이 모두 파싱되는가(깨진 JSON이 배포되면 페이지가 통째로 빈다)

    python3 scripts/check_repo.py    # 문제가 있으면 목록을 보이고 종료 코드 1
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
import sys
from pathlib import Path

PRIVATE = re.compile(
    r"(^|/)(\.claude/|data/raw/|data/incoming/|data/rejected/|data/private/|data/reviews/)"
    r"|^data/state\.json$|^log\.md$|^data/champion_profiles\.json$|^data/review\.html$")
ID_LITERAL = re.compile(r"""["'](\d{15,})["']""")
JWT = re.compile(r"eyJ[\w-]+\.([\w-]+)\.[\w-]+")
CODE_GLOBS = ("scripts/**/*.py", "scripts/**/*.sh", "site/*.js", "site/*.html", "site/city3d/js/*.js")
JSON_GLOBS = ("site/data/*.json", "data/cases.json", "data/community_stats.json", "data/mcp_reviews.json",
              "docs/native/eval_additions.json")


def find_private_paths(tracked: list[str]) -> list[str]:
    return [p for p in tracked if PRIVATE.search(p)]


def find_id_literals(text: str) -> list[str]:
    return ID_LITERAL.findall(text)


def find_secret_keys(text: str) -> list[str]:
    found = []
    for payload in JWT.findall(text):
        try:
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        except (ValueError, json.JSONDecodeError):
            continue
        if isinstance(claims, dict) and claims.get("role") == "service_role":
            found.append("service_role JWT")
    return found


def invalid_json(paths) -> list[str]:
    bad = []
    for p in paths:
        try:
            json.loads(Path(p).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            bad.append(str(p))
    return bad


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    tracked = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True,
                             check=True).stdout.splitlines()
    problems = [f"비공개 경로 추적: {p}" for p in find_private_paths(tracked)]
    for pattern in CODE_GLOBS:
        for f in sorted(root.glob(pattern)):
            text = f.read_text(encoding="utf-8", errors="ignore")
            rel = f.relative_to(root)
            problems += [f"긴 숫자 상수(채팅방 ID 의심) {rel}: {v}" for v in find_id_literals(text)]
            problems += [f"비밀 키 {rel}: {k}" for k in find_secret_keys(text)]
    json_files = [p for g in JSON_GLOBS for p in sorted(root.glob(g))]
    problems += [f"깨진 JSON: {p}" for p in invalid_json(json_files)]
    for line in problems:
        print(line, file=sys.stderr)
    print(f"저장소 점검: 추적 {len(tracked)}개 · JSON {len(json_files)}개 · 문제 {len(problems)}건")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
