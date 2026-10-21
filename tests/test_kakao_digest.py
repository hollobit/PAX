"""카카오 일일 현황 알림 — 메시지 조립만 검사한다(전송은 UI 자동화라 시험하지 않는다)."""
import kakao_digest as kd

HISTORY = {"days": {"2026-10-21": {"total_cases": 589, "total_champions": 236, "members": 2551}}}


def test_message_uses_previous_day_row_and_counts():
    msg = kd.build_message("2026-10-21", HISTORY, {"entries": []}, 112, 1081)
    assert msg.splitlines()[0] == "📊 모두의 공공AX 아카이브 현황 (10/21 기준)"
    assert "589건" in msg and "236명" in msg and "2,551명" in msg and "112편" in msg and "1,081건" in msg
    assert "바뀐 점" not in msg
    assert msg.endswith("https://hollobit.github.io/PAX/changelog.html")


def test_message_lists_that_days_changes_only():
    log = {"entries": [
        {"date": "2026-10-21", "items": ["사례 1건 추가 — 이음오피스(무료 오픈소스 오피스) (총 589건)"]},
        {"date": "2026-10-20", "items": ["사례 1건 추가 — 다른 사례 (총 588건)"]},
    ]}
    msg = kd.build_message("2026-10-21", HISTORY, log, 1, 1)
    assert "· 이음오피스(무료 오픈소스 오피스)" in msg
    assert "다른 사례" not in msg


def test_missing_day_returns_none():
    assert kd.build_message("2026-10-22", HISTORY, {}, 0, 0) is None


def test_shorten_item_caps_length_and_keeps_feature_items():
    assert kd.shorten_item("메뉴 개편") == "메뉴 개편"
    long = kd.shorten_item("사례 9건 추가 — " + "가" * 200 + " (총 9건)")
    assert len(long) == kd.ITEM_MAX_CHARS and long.endswith("…")


def test_missing_stat_falls_back_to_latest_earlier_row():
    history = {"days": {
        "2026-10-18": {"total_cases": 576, "members": 2537, "total_champions": 229},
        "2026-10-19": {"members": 2536, "total_champions": 229},
    }}
    msg = kd.build_message("2026-10-19", history, {}, 0, 0)
    assert "576건" in msg and "2,536명" in msg
