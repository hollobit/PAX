"""챔피언 소속 분류 규칙 테스트 — 공개 프로필 소속 텍스트 → 7개 카테고리."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from pax.affiliation import CATEGORIES, champion_category, classify_affiliation  # noqa: E402


@pytest.mark.parametrize("text,expected", [
    ("행정안전부", "중앙행정기관"),
    ("행정안전부 공공데이터분석관리과", "중앙행정기관"),
    ("병무청 경기북부병무지청", "중앙행정기관"),
    ("포항지방행양수산청", "중앙행정기관"),
    ("충남서부보훈지청", "중앙행정기관"),
    ("국가데이터처 동남지방데이터청", "중앙행정기관"),
    ("개인정보보호위원회", "중앙행정기관"),
    ("지식재산처 IP-AX 추진단", "중앙행정기관"),
    ("국립국어원", "중앙행정기관"),
    ("농촌진흥청", "중앙행정기관"),
    ("경기도", "광역지자체"),
    ("강원특별자치도", "광역지자체"),
    ("대전광역시청", "광역지자체"),
    ("전남광주통합특별시 기획조정실 전략정책관 전략기획관실", "광역지자체"),
    ("강원소방본부", "광역지자체"),
    ("의령소방서", "광역지자체"),
    ("광양시", "기초지자체"),
    ("횡성군청", "기초지자체"),
    ("서울특별시 광진구", "기초지자체"),
    ("울산광역시 중구", "기초지자체"),
    ("경남 양산시", "기초지자체"),
    ("충청남도 아산시 정보통신과", "기초지자체"),
    ("제주특별자치도 서귀포시", "기초지자체"),
    ("강원특별자치도 강릉시 기업지원과", "기초지자체"),
    ("화성특례시", "기초지자체"),
    ("김포시의회", "기초지자체"),
    ("한국철도공사 IT운영센터", "공공기관"),
    ("한국지능정보사회진흥원", "공공기관"),
    ("국립공원공단", "공공기관"),
    ("한국학중앙연구원", "공공기관"),
    ("국가독성과학연구소", "공공기관"),
    ("ETRI", "공공기관"),
    ("한국국제협력단", "공공기관"),
    ("한국사회보장정보원", "공공기관"),
    ("코레일유통", "공공기관"),
    ("Electronics Telecommunications Research Institute (ETRI)", "공공기관"),
    ("Korea Aerospace Research Institute", "공공기관"),
    ("국립농업과학원", "중앙행정기관"),
    ("서울시교육청 대청중학교", "교육기관"),
    ("[서울]동작관악교육지원청", "교육기관"),
    ("제주대학교", "교육기관"),
    ("국립순천대학교", "교육기관"),
    ("Korea University", "교육기관"),
    ("경기도교육청 현암고등학교", "교육기관"),
    ("PortOne", "민간·커뮤니티"),
    ("team-attention", "민간·커뮤니티"),
])
def test_classify_affiliation(text, expected):
    assert classify_affiliation(text) == expected


def test_classify_empty():
    assert classify_affiliation(None) is None
    assert classify_affiliation("  ") is None


def test_category_prefers_affiliation():
    aff = {"value": "통일부", "inferred": False}
    assert champion_category(aff, ["커뮤니티"]) == ("중앙행정기관", "affiliation")


def test_category_falls_back_to_case_org_types():
    assert champion_category(None, ["공직 개인", "기초지자체"]) == ("기초지자체", "cases")
    assert champion_category(None, ["지방의회"]) == ("기초지자체", "cases")
    assert champion_category(None, ["커뮤니티", "커뮤니티"]) == ("민간·커뮤니티", "cases")
    assert champion_category(None, ["공직 개인"]) == ("공직(소속 미상)", "cases")
    assert champion_category(None, []) == ("공직(소속 미상)", "cases")


def test_categories_order_covers_all_results():
    assert CATEGORIES[0] == "중앙행정기관" and "공직(소속 미상)" in CATEGORIES
