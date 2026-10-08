"""국토교통부 GIS건물통합정보 → 건물 높이 규칙(scripts/city3d/gisbldg.py)."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("shapely")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "city3d"))
import gisbldg as gb  # noqa: E402


def test_height_prefers_registry_height_then_floors():
    assert gb.gis_height({"height": "150.15", "grnd_flr": "37"}) == (150.15, gb.F_GIS)
    assert gb.gis_height({"height": "0", "grnd_flr": "12"}) == (36.0, gb.F_GIS | gb.F_FLOORS)
    assert gb.gis_height({"height": "", "grnd_flr": "0"}) is None


def test_implausible_heights_fall_back_to_floors():
    # 1m 같은 오기·600m 넘는 값은 믿지 않는다(국내 최고 555m)
    assert gb.gis_height({"height": "1.0", "grnd_flr": "3"}) == (9.0, gb.F_GIS | gb.F_FLOORS)
    assert gb.gis_height({"height": "1200", "grnd_flr": "0"}) is None
    assert gb.gis_height({"height": "abc", "grnd_flr": "x"}) is None


def test_registry_height_must_agree_with_floors():
    # 실측 오기: 1층 305m, 9층 283m, 3층 123m — 층수 환산으로 내린다
    assert gb.gis_height({"height": "305", "grnd_flr": "1"}) == (3.0, gb.F_GIS | gb.F_FLOORS)
    assert gb.gis_height({"height": "283", "grnd_flr": "9"}) == (27.0, gb.F_GIS | gb.F_FLOORS)
    assert gb.registry_height({"height": "245.5", "grnd_flr": "50"}) == 245.5   # 정상 초고층
    assert gb.registry_height({"height": "18", "grnd_flr": "1"}) == 18.0        # 강당·체육관
    assert gb.registry_height({"height": "150", "grnd_flr": "0"}) is None       # 층수 없는 큰 값
    assert gb.floor_height({"grnd_flr": "116"}) is None                         # 80층 초과 층수 오기


def test_concave_footprints_are_split_but_compact_ones_are_not():
    from shapely.geometry import Polygon, box
    compact = box(0, 0, 30, 20)
    assert gb.split_pieces(compact) == [compact]
    # ㄷ자(바깥 100×60, 가운데 마당 80×40) — 상자 하나면 마당까지 덮는다
    u = Polygon([(0, 0), (100, 0), (100, 60), (90, 60), (90, 10), (10, 10), (10, 60), (0, 60)])
    pieces = gb.split_pieces(u)
    assert len(pieces) > 1
    assert abs(sum(p.area for p in pieces) - u.area) < 1
    assert all(p.area <= gb.SPLIT_CELL_M ** 2 + 1e-6 for p in pieces)


def test_flags_keep_estimate_bits_separate_from_source_bits():
    # 화면은 flags & 3만 추정(회색)으로 칠한다 — 출처·층수 비트가 거기에 겹치면 안 된다
    assert (gb.F_GIS | gb.F_FLOORS) & 3 == 0
    assert gb.F_EST & 3 and gb.F_CORR & 3


def test_underground_facilities_are_not_raised_as_buildings():
    assert gb.is_underground({"grnd_flr": "0", "ugrnd_flr": "2"})            # 지하 전용
    assert gb.is_underground({"bld_nm": "시청광장지하쇼핑센터", "grnd_flr": "0"})  # 층수 정보 없는 지하상가
    assert gb.is_underground({"bld_nm": "합정역", "height": "0"})
    assert gb.is_underground({"bld_nm": "공항시장역(9호선)"})
    assert not gb.is_underground({"bld_nm": "서울역", "grnd_flr": "4"})        # 지상 층수가 있으면 남긴다
    assert not gb.is_underground({"bld_nm": "국내선청사", "grnd_flr": "0"})


def test_use_codes_map_to_facade_kinds_in_free_flag_bits():
    assert gb.use_kind({"usability": "02000"}) == 1     # 공동주택
    assert gb.use_kind({"usability": "14000"}) == 4     # 업무
    assert gb.use_kind({"usability": "17000"}) == 5     # 공장
    assert gb.use_kind({"usability": ""}) == 0
    assert max(gb.USE_KIND.values()) <= 7               # 3비트
    assert (7 << gb.KIND_SHIFT) & (gb.F_EST | gb.F_CORR | gb.F_GIS | gb.F_FLOORS) == 0
