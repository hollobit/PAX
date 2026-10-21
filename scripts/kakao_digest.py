#!/usr/bin/env python3
"""카카오 오픈톡 일일 현황 알림의 본문 — 전날까지의 아카이브 현황과 전날 변경 기록을 한 메시지로 만든다.

전송은 scripts/kakao_digest.sh가 한다(세션 크론, 매일 06:00). kakaocli는 python을 거쳐 부르면
카카오톡 앱 데이터 접근이 막히는 환경이 있어 이 파일은 kakaocli를 부르지 않고 본문만 출력한다.
- 수치: site/data/dashboard-history.json의 전날 행(사례·챔피언·가입자) + 동영상·뉴스 공개본 건수.
- 변경: site/data/changelog.json의 전날 항목(제목 부분만 줄여서).
사용법: python3 scripts/kakao_digest.py [--day YYYY-MM-DD]   (기본: 한국 시간 어제)
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pax.timeutil import kst_today  # noqa: E402

SITE = Path(__file__).resolve().parent.parent / "site/data"
SITE_URLS = ("https://hollobit.github.io/PAX/observatory.html",
             "https://hollobit.github.io/PAX/changelog.html")
ITEM_MAX_CHARS = 90
MAX_ITEMS = 6


def _load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8")) or {}
    except (OSError, ValueError):
        return {}


def shorten_item(item: str) -> str:
    """'사례 2건 추가 — A·B (총 585건)' → 'A·B'. 기능 변경 항목은 그대로 두고 길이만 자른다."""
    body = item.split(" — ", 1)[1] if " — " in item else item
    body = body.rsplit(" (총 ", 1)[0].strip()
    return body if len(body) <= ITEM_MAX_CHARS else body[:ITEM_MAX_CHARS - 1].rstrip() + "…"


STAT_KEYS = ("total_cases", "total_champions", "members")


def stats_as_of(day: str, history: dict) -> dict | None:
    """day까지의 최신 수치. 현황판 행은 그날 바뀐 값만 담기도 해서(예: 사례 변동 없는 날은 total_cases 없음)
    수치마다 day 이전 가장 가까운 행에서 찾는다. 그날 행이 없거나 못 채운 수치가 있으면 None."""
    days = history.get("days") or {}
    if day not in days:
        return None
    row = {}
    for d in sorted((d for d in days if d <= day), reverse=True):
        for k in STAT_KEYS:
            if k not in row and k in days[d]:
                row[k] = days[d][k]
        if len(row) == len(STAT_KEYS):
            return row
    return None


def build_message(day: str, history: dict, changelog: dict, videos: int, news: int) -> str | None:
    """day(YYYY-MM-DD)까지의 현황 메시지. 그날 현황을 못 채우면 None(보낼 근거가 없다)."""
    row = stats_as_of(day, history)
    if not row:
        return None
    md = f"{int(day[5:7])}/{int(day[8:10])}"
    lines = [
        f"📊 모두의 공공AX 아카이브 현황 ({md} 기준)",
        f"모두의 공공AX 아카이브 사례로 등록된 건수가 {row['total_cases']:,}건, "
        f"프로젝트가 확인된 챔피언 {row['total_champions']:,}명, 오픈톡 가입자는 {row['members']:,}명, "
        f"공유 동영상은 {videos:,}편, 공유 뉴스는 {news:,}건을 기록했네요 ^^",
    ]
    items = next((e["items"] for e in changelog.get("entries", []) if e.get("date") == day), [])
    if items:
        lines += ["", f"🆕 {md} 바뀐 점"]
        lines += [f"· {shorten_item(i)}" for i in items[:MAX_ITEMS]]
        if len(items) > MAX_ITEMS:
            lines.append(f"· 외 {len(items) - MAX_ITEMS}건")
    lines += ["", *SITE_URLS]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--day", default=(kst_today() - datetime.timedelta(days=1)).isoformat())
    day = ap.parse_args().day
    text = build_message(day, _load(SITE / "dashboard-history.json"), _load(SITE / "changelog.json"),
                         _load(SITE / "videos.json").get("count", 0), _load(SITE / "news.json").get("count", 0))
    if text is None:
        print(f"{day} 현황판 행 없음", file=sys.stderr)
        return 1
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
