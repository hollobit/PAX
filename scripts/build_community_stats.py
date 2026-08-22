#!/usr/bin/env python3
"""커뮤니티 활력 지표 산출 — 카카오 대화량·오픈톡 가입자·Threads 관측 게시물.

- data/community_stats.json: 일자별 원장(append·idempotent) — 카카오 일별 메시지 수
  (raw 아카이브 고유 id 기준), 가입자 수 스냅샷, Threads 관측 누적.
- site/data/community.json: 일/주/월/전체 집계 + 최근 21일 시계열 (관측소 표시용).

주의: 카카오 수치는 "수집 아카이브 기반 관측치"다 — 수집 공백·앱 미동기화 구간은
과소 집계된다. Threads는 태그 검색 관측치로 전체 게시물 수가 아니다. 표시 시 항상 병기할 것.
"""
import datetime
import glob
import json
import subprocess
from collections import Counter
from pathlib import Path

LEDGER = Path("data/community_stats.json")
OUT = Path("site/data/community.json")
CHAT_ID = "18487372050628026"


def load_ledger() -> dict:
    if LEDGER.exists():
        return json.load(open(LEDGER))
    return {"kakao_daily": {}, "members": {}, "threads_seen": {}}


def backfill_kakao(ledger: dict):
    """raw 아카이브 전체에서 고유 메시지 id 기준 일별 집계 — 항상 전량 재계산해
    과거 파일 추가·수집 보완도 자동 반영한다."""
    ids = set()
    by_date = Counter()
    for f in glob.glob("data/raw/*kakao*.json"):
        try:
            msgs = json.load(open(f))
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(msgs, list):
            continue
        for m in msgs:
            mid = m.get("id")
            date = (m.get("timestamp") or "")[:10]
            if mid and date and mid not in ids:
                ids.add(mid)
                by_date[date] += 1
    for date, n in by_date.items():
        # 관측치는 과소 집계만 가능하므로 항상 최댓값 유지
        ledger["kakao_daily"][date] = max(ledger["kakao_daily"].get(date, 0), n)


def snapshot_members(ledger: dict, today: str):
    try:
        out = subprocess.run(["kakaocli", "chats", "--limit", "30", "--json"],
                             capture_output=True, text=True, timeout=30)
        chats = json.loads(out.stdout)
        target = next((c for c in chats if str(c.get("id")) == CHAT_ID), None)
        if target and target.get("member_count"):
            ledger["members"][today] = target["member_count"]
    except Exception:
        pass  # 실패 시 이날 스냅샷만 결측 — 다음 실행에서 재시도


def snapshot_threads(ledger: dict, today: str):
    try:
        state = json.load(open("data/state.json"))
        ledger["threads_seen"][today] = len(state["threads"]["seen_ids"])
    except Exception:
        pass


def aggregates(daily: dict, today: datetime.date) -> dict:
    def window(days):
        cutoff = (today - datetime.timedelta(days=days - 1)).isoformat()
        return sum(n for d, n in daily.items() if d >= cutoff)
    return {"today": daily.get(today.isoformat(), 0),
            "week": window(7), "month": window(30),
            "total": sum(daily.values()),
            "observed_days": len(daily)}


def main():
    today = datetime.date.today()
    ledger = load_ledger()
    backfill_kakao(ledger)
    snapshot_members(ledger, today.isoformat())
    snapshot_threads(ledger, today.isoformat())
    LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=1) + "\n",
                      encoding="utf-8")

    members = ledger["members"]
    member_dates = sorted(members)
    threads = ledger["threads_seen"]
    thread_dates = sorted(threads)
    recent = [(d, ledger["kakao_daily"].get(d, 0))
              for d in ((today - datetime.timedelta(days=i)).isoformat()
                        for i in range(20, -1, -1))]
    doc = {
        "generated_at": today.isoformat(),
        "note": "카카오 수치는 수집 아카이브 기반 관측치(공백 구간 과소 집계), Threads는 태그 검색 관측 누적",
        "kakao": aggregates(ledger["kakao_daily"], today),
        "kakao_recent": recent,
        "members": {
            "latest": members[member_dates[-1]] if member_dates else None,
            "latest_date": member_dates[-1] if member_dates else None,
            "first": members[member_dates[0]] if member_dates else None,
            "first_date": member_dates[0] if member_dates else None,
            "series": [(d, members[d]) for d in member_dates[-30:]],
        },
        "threads": {
            "observed_total": threads[thread_dates[-1]] if thread_dates else None,
            "week_new": (threads[thread_dates[-1]] - threads[thread_dates[0]])
                        if len(thread_dates) >= 2 else None,
        },
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    k = doc["kakao"]
    print(f"community.json ← 오늘 {k['today']} / 주 {k['week']} / 월 {k['month']} / "
          f"전체 {k['total']}건 · 가입자 {doc['members']['latest']}명 · "
          f"Threads 관측 {doc['threads']['observed_total']}건")


if __name__ == "__main__":
    main()
