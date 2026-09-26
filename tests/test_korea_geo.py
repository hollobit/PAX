"""3D PAX 지도 자료 — 경계 생성기의 이름 규칙과 커밋된 산출물(시도·시군구·기관 좌표)을 점검한다."""
import json
from pathlib import Path

from build_korea_geo import REGIONS, region_of, sgg_name
from build_org_locations import INSTITUTIONS, in_polys

DATA = Path(__file__).resolve().parent.parent / "site" / "data"
GAP_MAP_REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
                   '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']


def load(name):
    return json.loads((DATA / name).read_text())


def test_region_names_match_site_regions():
    assert sorted(REGIONS) == sorted(GAP_MAP_REGIONS)


def test_merged_city_splits_back_to_gwangju_and_jeonnam():
    assert region_of("전남광주통합특별시", "광산구") == "광주"
    assert region_of("전남광주통합특별시", "순천시") == "전남"
    assert region_of("강원특별자치도", "원주시") == "강원"


def test_ordinary_city_districts_fold_into_city_but_metro_districts_stay():
    assert sgg_name("경기도", "성남시분당구") == "성남시"
    assert sgg_name("경기도", "의정부시") == "의정부시"
    assert sgg_name("서울특별시", "광진구") == "광진구"


def test_committed_sido_has_all_regions_in_korea_bounds():
    doc = load("korea-geo.json")
    assert sorted(doc["regions"]) == sorted(GAP_MAP_REGIONS)
    for name, polys in doc["regions"].items():
        assert polys, name
        for poly in polys:
            for ring in poly:
                assert len(ring) >= 3
                assert all(124 < lon < 132 and 33 < lat < 39 for lon, lat in ring), name


def test_enclosed_city_leaves_hole_in_province():
    doc = load("korea-geo.json")
    assert any(len(poly) > 1 for poly in doc["regions"]["전남"])   # 광주를 둘러싼 전남


def test_committed_sgg_covers_every_region_with_unique_names_per_region():
    sgg = load("korea-sgg.json")["sgg"]
    assert 220 <= len(sgg) <= 240
    assert {s["region"] for s in sgg} == set(GAP_MAP_REGIONS)
    keys = [(s["region"], s["name"]) for s in sgg]
    assert len(keys) == len(set(keys))
    for s in sgg:
        assert s["polys"], s["name"]
        assert in_polys(*s["center"], s["polys"]), s["name"]   # 대표점은 경계 안


def test_institution_points_fall_in_their_sgg():
    sgg = {(s["region"], s["name"]): s for s in load("korea-sgg.json")["sgg"]}
    insts = load("org-locations.json")["institutions"]
    assert len(insts) == len(INSTITUTIONS)
    for i in insts:
        assert i["precision"] in {"address", "osm-name", "sgg"}
        assert in_polys(i["lon"], i["lat"], sgg[(i["region"], i["sgg"])]["polys"]), i["name"]
        assert i["kw"], i["name"]
