"""3D PAX 지도 경계 — 생성기 단순화 동작과 커밋된 산출물의 시도 집합을 점검한다."""
import json
from pathlib import Path

from build_korea_geo import ISO_TO_REGION, ring_area, simplify

GEO = Path(__file__).resolve().parent.parent / "site" / "data" / "korea-geo.json"
GAP_MAP_REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
                   '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']


def test_simplify_drops_collinear_points_and_keeps_corners():
    line = [(0, 0), (1, 0.0001), (2, 0), (2, 2)]
    assert simplify(line, 0.01) == [(0, 0), (2, 0), (2, 2)]


def test_ring_area_of_unit_square():
    assert ring_area([(0, 0), (1, 0), (1, 1), (0, 1)]) == 1


def test_iso_map_covers_site_regions():
    assert sorted(ISO_TO_REGION.values()) == sorted(GAP_MAP_REGIONS)


def test_committed_geo_has_all_regions_with_rings():
    doc = json.loads(GEO.read_text())
    assert sorted(doc["regions"]) == sorted(GAP_MAP_REGIONS)
    for name, polys in doc["regions"].items():
        assert polys, name
        for poly in polys:
            for ring in poly:
                assert len(ring) >= 3
                for lon, lat in ring:
                    assert 124 < lon < 132 and 33 < lat < 39, (name, lon, lat)


def test_enclosing_provinces_keep_holes_for_their_cities():
    doc = json.loads(GEO.read_text())
    for province in ("경기", "전남", "경북"):   # 서울·광주·대구를 둘러싼 도
        assert any(len(poly) > 1 for poly in doc["regions"][province]), province
