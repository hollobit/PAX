#!/usr/bin/env python3
"""커뮤니티 활력 지표 산출 — 카카오 대화량·오픈톡 가입자·Threads 관측 게시물.

- data/community_stats.json: 일자별 원장(append·idempotent) — 카카오 일별 메시지 수
  (raw 아카이브 고유 id 기준), 가입자 수 스냅샷, Threads 관측 누적.
- site/data/community.json: 일/주/월/전체 집계 + 최근 21일 시계열 (관측소 표시용).

주의: 카카오 수치는 "수집 아카이브 기반 관측치"다 — 수집 공백·앱 미동기화 구간은
과소 집계된다. Threads는 태그 검색 관측치로 전체 게시물 수가 아니다. 표시 시 항상 병기할 것.
날짜는 모두 한국 시간(KST) 기준이다 — 원장의 date_basis가 그 표시다(pax.timeutil).
"""
import datetime
import glob
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

from pax.jsonio import write_json  # noqa: E402
from pax.timeutil import kst_date, kst_today  # noqa: E402

LEDGER = Path("data/community_stats.json")
OUT = Path("site/data/community.json")
STATE = Path("data/state.json")  # 비공개 — 채팅방 ID·Threads 관측 목록
MEMBER_DROP_TOLERANCE = 0.97  # 직전 스냅샷보다 3% 넘게 낮으면 방 정보 미갱신으로 본다
KAKAOCLI_TIMEOUT_S = 30
RECENT_DAYS = 21
MEMBER_SERIES_DAYS = 30


def warn(msg: str) -> None:
    print(f"경고: {msg}", file=sys.stderr)


def load_chat_id(state_path: Path = STATE):
    """채팅방 ID는 공개 저장소에 두지 않고 비공개 state에서 읽는다. 없으면 None."""
    try:
        return str(json.loads(Path(state_path).read_text(encoding="utf-8"))["kakao"]["chat_id"])
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        return None


def load_ledger() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    # 새 원장은 처음부터 KST 기준이다
    return {"kakao_daily": {}, "members": {}, "threads_seen": {}, "date_basis": "KST"}


def iter_raw_lists():
    """data/raw의 카카오 원본 가운데 kakaocli 리스트 형식 파일만 차례로 돌려준다."""
    for f in sorted(glob.glob("data/raw/*kakao*.json")):
        try:
            msgs = json.loads(Path(f).read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            warn(f"{f} 읽기 실패 — 건너뜀 ({e})")
            continue
        if isinstance(msgs, list):
            yield msgs


def count_messages(raw_lists):
    """고유 메시지 id 기준 일별 건수 — (KST 날짜별, UTC 날짜별). UTC는 옛 원장 전환에만 쓴다."""
    ids = set()
    kst, utc = Counter(), Counter()
    for msgs in raw_lists:
        for m in msgs:
            mid, ts = m.get("id"), m.get("timestamp")
            day = kst_date(ts)
            if not mid or not day or mid in ids:
                continue
            ids.add(mid)
            kst[day] += 1
            utc[ts[:10]] += 1
    return dict(kst), dict(utc)


def migrate_kakao_to_kst(ledger: dict, kst: dict, utc: dict) -> None:
    """UTC 날짜로 쌓인 옛 원장을 한 번만 KST로 다시 쌓는다.

    원본이 유실된 날(옛 원장 > 원본 UTC 재집계)은 모자란 만큼을 같은 날짜에 더해 총계를 보존한다 —
    그날 메시지의 대부분(UTC 00~15시)이 같은 한국 날짜에 속하므로 가장 가까운 근사다.
    """
    if ledger.get("date_basis") == "KST":
        return
    old = ledger.get("kakao_daily", {})
    rebuilt = dict(kst)
    for day, n in old.items():
        deficit = n - utc.get(day, 0)
        if deficit > 0:
            rebuilt[day] = rebuilt.get(day, 0) + deficit
    ledger["kakao_daily"] = dict(sorted(rebuilt.items()))
    ledger["date_basis"] = "KST"


def backfill_kakao(ledger: dict):
    """raw 아카이브 전체에서 고유 메시지 id 기준 일별 집계 — 항상 전량 재계산해
    과거 파일 추가·수집 보완도 자동 반영한다."""
    kst, utc = count_messages(iter_raw_lists())
    if ledger.get("date_basis") != "KST":
        # 입장·퇴장도 같은 회차에 KST로 옮긴다 — date_basis는 두 전환이 끝난 뒤에 찍는다
        kst_m, utc_m = count_membership(iter_raw_lists())
        migrate_membership_to_kst(ledger, kst_m, utc_m)
        migrate_kakao_to_kst(ledger, kst, utc)
        return
    for date, n in kst.items():
        # 관측치는 과소 집계만 가능하므로 항상 최댓값 유지
        ledger["kakao_daily"][date] = max(ledger["kakao_daily"].get(date, 0), n)


def count_membership(raw_lists):
    """system 피드(feedType 4=입장, 2=퇴장)의 일별 입장·퇴장 — (KST 날짜별, UTC 날짜별).
    메시지 id 기준 dedupe — 여러 raw 파일에 겹쳐 있어도 안전."""
    seen = set()
    kst, utc = {}, {}
    for msgs in raw_lists:
        for m in msgs:
            if m.get("type") != "system" or not m.get("id") or m["id"] in seen:
                continue
            seen.add(m["id"])
            try:
                feed = json.loads(m.get("text") or "{}")
            except json.JSONDecodeError:
                continue
            day = kst_date(m.get("timestamp"))
            if not day:
                continue
            if feed.get("feedType") == 4 and "members" in feed:
                key, n = "joins", len(feed["members"])
            elif feed.get("feedType") == 2 and "member" in feed:
                key, n = "leaves", 1
            else:
                continue
            for bucket, d in ((kst, day), (utc, m["timestamp"][:10])):
                cell = bucket.setdefault(d, {"joins": 0, "leaves": 0})
                cell[key] += n
    return kst, utc


def migrate_membership_to_kst(ledger: dict, kst: dict, utc: dict) -> None:
    """입장·퇴장 원장을 KST로 다시 쌓되, 원본이 유실된 날의 모자란 만큼은 같은 날짜에 보존한다."""
    rebuilt = {d: dict(v) for d, v in kst.items()}
    for day, old in ledger.get("membership_daily", {}).items():
        for key in ("joins", "leaves"):
            deficit = old.get(key, 0) - utc.get(day, {}).get(key, 0)
            if deficit > 0:
                cell = rebuilt.setdefault(day, {"joins": 0, "leaves": 0})
                cell[key] += deficit
    ledger["membership_daily"] = dict(sorted(rebuilt.items()))


def backfill_membership(ledger: dict):
    """KST 기준 입장·퇴장을 원장에 반영한다(관측치라 날마다 최댓값 유지)."""
    kst, _ = count_membership(iter_raw_lists())
    for d, v in kst.items():
        prev = ledger.setdefault("membership_daily", {}).get(d, {})
        ledger["membership_daily"][d] = {
            "joins": max(prev.get("joins", 0), v["joins"]),
            "leaves": max(prev.get("leaves", 0), v["leaves"]),
        }


def snapshot_members(ledger: dict, today: str):
    """가입자 수 스냅샷. 실패하면 이날만 결측으로 두고(다음 실행에서 재시도) 경고를 남긴다."""
    chat_id = load_chat_id()
    if not chat_id:
        warn("data/state.json에 kakao.chat_id가 없어 가입자 스냅샷을 건너뜀")
        return
    try:
        out = subprocess.run(["kakaocli", "chats", "--limit", "30", "--json"],
                             capture_output=True, text=True, timeout=KAKAOCLI_TIMEOUT_S)
    except (OSError, subprocess.TimeoutExpired) as e:
        warn(f"kakaocli 실행 실패 — 가입자 스냅샷 결측 ({e})")
        return
    if out.returncode != 0:
        warn(f"kakaocli 종료 코드 {out.returncode} — 가입자 스냅샷 결측")
        return
    try:
        chats = json.loads(out.stdout)
    except json.JSONDecodeError:
        warn("kakaocli 출력이 JSON이 아님 — 가입자 스냅샷 결측")
        return
    target = next((c for c in chats if str(c.get("id")) == chat_id), None)
    if not (target and target.get("member_count")):
        warn("대상 방의 가입자 수를 찾지 못함 — 가입자 스냅샷 결측")
        return
    count = target["member_count"]
    # 앱이 정체에서 막 복구된 직후에는 방 정보(activeMembersCount)가 메시지보다 늦게
    # 갱신돼 며칠 전 값이 찍힌다(실측: 실제 1,951명인데 1,746으로 기록, 전날 1,923).
    # 직전 스냅샷보다 3% 넘게 낮으면 그날은 결측으로 두고 다음 실행에서 다시 찍는다.
    prev = [v for d, v in sorted(ledger["members"].items()) if d < today][-1:]
    if prev and count < prev[0] * MEMBER_DROP_TOLERANCE:
        print(f"가입자 스냅샷 보류: {count} < 직전 {prev[0]}의 97% (방 정보 미갱신 의심)")
        return
    ledger["members"][today] = count


def snapshot_threads(ledger: dict, today: str):
    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
        ledger["threads_seen"][today] = len(state["threads"]["seen_ids"])
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as e:
        warn(f"Threads 관측 수를 읽지 못함 — 이날 결측 ({e})")


def reconstruct_members_daily(membership: dict, latest_count) -> list:
    """가입자 일별 추이 — 최신 실측 스냅샷을 기준점으로 입장·퇴장 피드를 역산한다.

    cumulative(마지막 날) = 현재 실측값이 되도록 뒤에서 앞으로 순증을 빼며 채운다.
    피드 유실 시 오차 가능(관측치) — 표시 시 항상 병기할 것.
    """
    if not membership or not latest_count:
        return []
    days = sorted(membership)
    cumulative = {}
    running = latest_count
    for d in reversed(days):
        cumulative[d] = running
        running -= membership[d]["joins"] - membership[d]["leaves"]
    return [{"date": d, "joins": membership[d]["joins"],
             "leaves": membership[d]["leaves"], "cumulative": cumulative[d]}
            for d in days]


def aggregates(daily: dict, today: datetime.date) -> dict:
    def window(days):
        cutoff = (today - datetime.timedelta(days=days - 1)).isoformat()
        return sum(n for d, n in daily.items() if d >= cutoff)
    return {"today": daily.get(today.isoformat(), 0),
            "week": window(7), "month": window(30),
            "total": sum(daily.values()),
            "observed_days": len(daily)}


def main():
    today = kst_today()
    ledger = load_ledger()
    backfill_kakao(ledger)
    backfill_membership(ledger)
    snapshot_members(ledger, today.isoformat())
    snapshot_threads(ledger, today.isoformat())
    write_json(LEDGER, ledger)

    members = ledger["members"]
    member_dates = sorted(members)
    threads = ledger["threads_seen"]
    thread_dates = sorted(threads)
    recent = [(d, ledger["kakao_daily"].get(d, 0))
              for d in ((today - datetime.timedelta(days=i)).isoformat()
                        for i in range(RECENT_DAYS - 1, -1, -1))]
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
            "series": [(d, members[d]) for d in member_dates[-MEMBER_SERIES_DAYS:]],
        },
        "members_daily": reconstruct_members_daily(
            ledger.get("membership_daily", {}),
            members[member_dates[-1]] if member_dates else None),
        "threads": {
            "observed_total": threads[thread_dates[-1]] if thread_dates else None,
            "week_new": (threads[thread_dates[-1]] - threads[thread_dates[0]])
                        if len(thread_dates) >= 2 else None,
        },
    }
    write_json(OUT, doc)
    k = doc["kakao"]
    print(f"community.json ← 오늘 {k['today']} / 주 {k['week']} / 월 {k['month']} / "
          f"전체 {k['total']}건 · 가입자 {doc['members']['latest']}명 · "
          f"Threads 관측 {doc['threads']['observed_total']}건")


if __name__ == "__main__":
    main()
