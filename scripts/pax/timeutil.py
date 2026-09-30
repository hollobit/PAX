"""한국 시간(KST) 기준 날짜 — 파이프라인의 '오늘'과 일별 집계는 모두 이 기준이다.

카카오 원본 timestamp는 UTC('...Z')라서 앞 10자를 잘라 날짜로 쓰면 한국 00~09시 메시지가
전날로 들어간다(2026-09-30 07:33 회차가 '오늘 0건'으로 보인 원인). 날짜는 여기서만 만든다.
"""
from __future__ import annotations

import datetime

KST = datetime.timezone(datetime.timedelta(hours=9), "KST")


def kst_now() -> datetime.datetime:
    return datetime.datetime.now(KST)


def kst_today() -> datetime.date:
    return kst_now().date()


def kst_date(ts) -> str | None:
    """ISO 시각 문자열 → 한국 날짜 'YYYY-MM-DD'. 시간대가 없으면 KST로 본다. 못 읽으면 None."""
    if not isinstance(ts, str) or not ts:
        return None
    try:
        dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=KST)
    return dt.astimezone(KST).date().isoformat()
