"""사례를 대표하는 주소를 고른다 — 썸네일과 카드 링크가 같은 답을 쓰게 하는 한 곳.

원칙(사용자 지시 2026-09-11): **운영 사이트가 있으면 저장소보다 먼저 보여 준다.**
사람이 사례를 알아보는 것은 돌아가는 화면이지 코드 목록이 아니다. 예전에는 `case_url`이
있으면 그것을, 없으면 `link`를 썼는데 두 슬롯 중 어느 쪽에 서비스가 들어갈지는 등재 때
사정에 따라 달라서, 같은 성격의 사례가 어떤 것은 서비스로 어떤 것은 저장소로 보였다.

세 슬롯(link·case_url·mirror_url)을 모두 보고 저장소가 아닌 주소를 먼저 고른다.
`github.io`·`vercel.app` 같은 배포 주소는 호스팅이 깃허브여도 **서비스**로 본다 —
사람이 열면 돌아가는 화면이 나오기 때문이다.
"""
from __future__ import annotations

import re

# 코드를 보여 주는 곳. github.io는 배포 주소이므로 여기에 넣지 않는다.
REPO_HOST = re.compile(
    r"^https?://(www\.)?(github\.com|gitlab\.com|gitlab\.aigov\.go\.kr|bitbucket\.org"
    r"|gitee\.com|sourceforge\.net)/", re.I)

# 글·게시물 주소는 사례의 '대상'이 아니라 출처다 — 썸네일 대상으로 쓰지 않는다.
POST_HOST = re.compile(
    r"^https?://([\w.-]+\.)?(threads\.com|threads\.net|twitter\.com|x\.com"
    r"|facebook\.com|instagram\.com|brunch\.co\.kr|blog\.naver\.com)/", re.I)

SLOTS = ("case_url", "link", "mirror_url")


def is_repo(url: str) -> bool:
    return bool(url) and bool(REPO_HOST.match(url))


def is_post(url: str) -> bool:
    return bool(url) and bool(POST_HOST.match(url))


def preferred_url(case: dict) -> str | None:
    """대표 주소. 운영 사이트 > 저장소 순이며, 게시물 주소는 쓰지 않는다.

    같은 등급 안에서는 case_url → link → mirror_url 순서를 지킨다(기존 관행)."""
    slots = [case.get(k) for k in SLOTS]
    urls = [u for u in slots if isinstance(u, str) and u.startswith("https://")]
    if not urls:
        return None
    live = [u for u in urls if not is_repo(u) and not is_post(u)]
    if live:
        return live[0]
    repos = [u for u in urls if is_repo(u)]
    return repos[0] if repos else None
