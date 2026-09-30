import datetime
import json

import build_community_stats as bcs


def _msg(mid, ts, **kw):
    return {"id": mid, "timestamp": ts, **kw}


def test_count_messages_buckets_by_korean_day_and_dedupes():
    msgs = [
        _msg("1", "2026-09-29T22:10:00Z"),  # KST 09-30 07:10
        _msg("1", "2026-09-29T22:10:00Z"),  # 같은 id — 다른 raw 파일에 겹친 것
        _msg("2", "2026-09-29T10:00:00Z"),  # KST 09-29 19:00
        _msg("3", None),
    ]
    kst, utc = bcs.count_messages([msgs])
    assert kst == {"2026-09-30": 1, "2026-09-29": 1}
    assert utc == {"2026-09-29": 2}


def test_migration_rebuilds_in_kst_and_keeps_totals_when_raw_is_incomplete():
    # 원장(UTC 기준)이 원본보다 많은 날은 원본이 유실된 날 — 모자란 만큼을 보존한다
    ledger = {"kakao_daily": {"2026-09-14": 637, "2026-09-15": 825}}
    kst = {"2026-09-14": 500, "2026-09-15": 120, "2026-09-16": 66}
    utc = {"2026-09-14": 621, "2026-09-15": 65}
    bcs.migrate_kakao_to_kst(ledger, kst, utc)
    assert ledger["date_basis"] == "KST"
    assert sum(ledger["kakao_daily"].values()) == 637 + 825
    assert ledger["kakao_daily"]["2026-09-14"] == 500 + 16
    assert ledger["kakao_daily"]["2026-09-15"] == 120 + 760
    assert ledger["kakao_daily"]["2026-09-16"] == 66


def test_migration_runs_once():
    ledger = {"kakao_daily": {"2026-09-30": 5}, "date_basis": "KST"}
    bcs.migrate_kakao_to_kst(ledger, {"2026-09-30": 1}, {"2026-09-29": 9})
    assert ledger["kakao_daily"] == {"2026-09-30": 5}


def test_aggregates_counts_today_in_kst():
    daily = {"2026-09-30": 145, "2026-09-29": 700, "2026-09-01": 10}
    agg = bcs.aggregates(daily, datetime.date(2026, 9, 30))
    assert agg["today"] == 145
    assert agg["week"] == 845
    assert agg["total"] == 855


def test_chat_id_comes_from_private_state(tmp_path):
    # 공개 저장소에 채팅방 ID를 두지 않는다 — 비공개 data/state.json에서 읽는다
    state = tmp_path / "state.json"
    state.write_text(json.dumps({"kakao": {"chat_id": "123"}}), encoding="utf-8")
    assert bcs.load_chat_id(state) == "123"
    assert bcs.load_chat_id(tmp_path / "none.json") is None


def test_no_chat_id_literal_in_tracked_source():
    # 카카오 채팅방 ID는 16자리 이상 숫자 — 공개 스크립트에 그런 상수를 두지 않는다
    import re
    src = open(bcs.__file__, encoding="utf-8").read()
    assert not re.search(r"[\"']\d{15,}[\"']", src)


def test_membership_migration_keeps_joins_lost_from_raw():
    ledger = {"membership_daily": {"2026-09-15": {"joins": 30, "leaves": 5}}}
    kst = {"2026-09-15": {"joins": 10, "leaves": 1}, "2026-09-16": {"joins": 4, "leaves": 0}}
    utc = {"2026-09-15": {"joins": 12, "leaves": 2}}
    bcs.migrate_membership_to_kst(ledger, kst, utc)
    m = ledger["membership_daily"]
    assert m["2026-09-15"] == {"joins": 10 + 18, "leaves": 1 + 3}
    assert m["2026-09-16"] == {"joins": 4, "leaves": 0}
