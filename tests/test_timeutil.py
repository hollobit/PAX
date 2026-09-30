import datetime

import pytest

from pax.timeutil import KST, kst_date, kst_today


@pytest.mark.parametrize("ts,expected", [
    ("2026-09-29T22:30:00Z", "2026-09-30"),   # UTC 밤 = 한국 다음 날 아침
    ("2026-09-29T14:59:59Z", "2026-09-29"),   # 한국 23:59:59
    ("2026-09-29T15:00:00Z", "2026-09-30"),   # 한국 자정
    ("2026-09-30T07:27:00+09:00", "2026-09-30"),  # 이미 KST로 적힌 값
    ("2026-09-30T00:10:00", "2026-09-30"),     # 시간대 없는 값은 KST로 본다
])
def test_kst_date_converts_to_korean_calendar_day(ts, expected):
    assert kst_date(ts) == expected


@pytest.mark.parametrize("bad", [None, "", "not-a-date", 12345])
def test_kst_date_rejects_unusable_values(bad):
    assert kst_date(bad) is None


def test_kst_today_uses_korean_time(monkeypatch):
    import pax.timeutil as tu

    class Fixed(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            # UTC 2026-09-29 22:33 = KST 2026-09-30 07:33 (문제의 07:33 회차)
            return datetime.datetime(2026, 9, 29, 22, 33, tzinfo=datetime.timezone.utc).astimezone(tz)
    monkeypatch.setattr(tu.datetime, "datetime", Fixed)
    assert kst_today() == datetime.date(2026, 9, 30)


def test_kst_is_plus_nine():
    assert KST.utcoffset(None) == datetime.timedelta(hours=9)
