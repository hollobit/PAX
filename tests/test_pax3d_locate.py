"""3D PAX 위치 판정(site/pax3d-locate.js) — 동명 지명·겹치는 이름·지청 같은 경계 사례를 node로 돌려 점검한다."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

pytestmark = pytest.mark.skipif(not shutil.which("node"), reason="node 없음")

SCRIPT = """
import fs from 'fs';
const src = fs.readFileSync('site/pax3d-locate.js', 'utf8');
const mod = await import('data:text/javascript,' + encodeURIComponent(src));
const sgg = JSON.parse(fs.readFileSync('site/data/korea-sgg.json', 'utf8')).sgg;
const org = JSON.parse(fs.readFileSync('site/data/org-locations.json', 'utf8'));
const L = mod.makeLocator(sgg);
const inst = mod.makeInstitutionFinder(org, L);
const loc = (t, hint) => { const s = L.locate([t], hint); return s ? `${s.region} ${s.name}` : null; };
const out = {
  gangseo: loc('부산 강서구'),
  bareJunggu: loc('중구청'),
  ulsanJunggu: loc('울산광역시 중구'),
  gwangjuSi: loc('광주시청'),
  gyeonggiGwangju: loc('경기도 광주시'),
  jointOffice: loc('경기도화성오산교육지원청'),
  university: loc('국립순천대학교'),
  seongnam: loc('성남시청'),
  mergedCity: L.regionOf('전남광주통합특별시 기획조정실'),
  hq: (inst(['병무청']) || {}).region,
  branch: inst(['병무청 경기북부병무지청']),
  firstMentioned: (inst(['과학기술정보통신부·NIA']) || {}).name,
  longerName: (inst(['코레일유통']) || {}).name,
  asciiWord: inst(['ASIAN 연구소']),
  specialCity: loc('화성특례시 AI스마트전략실'),
  specialSuwon: loc('수원특례시청'),
  // 경기 사례 — 기관명엔 화성특례시, 만든 사람 소속엔 서울 광진구(포팅). 경기 안의 화성시여야 한다
  portedCase: (() => { const s = L.locate(['화성특례시·광진구', '서울특별시 광진구'], '경기'); return s ? `${s.region} ${s.name}` : null; })(),
  // 시도 힌트가 있으면 다른 시도 시군구만 적힌 글로는 판정하지 않는다
  otherRegionOnly: L.locate(['서울특별시 광진구'], '경기'),
  labelHwaseong: mod.sggLabel('경기', '화성시'),
  labelChangwon: mod.sggLabel('경남', '창원시'),
  labelPlain: mod.sggLabel('경기', '성남시'),
};
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def result():
    out = subprocess.run(["node", "--input-type=module", "-e", SCRIPT], cwd=ROOT,
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_longer_district_name_wins(result):
    assert result["gangseo"] == "부산 강서구"


def test_duplicate_district_needs_province(result):
    assert result["bareJunggu"] is None
    assert result["ulsanJunggu"] == "울산 중구"


def test_gwangju_si_is_ambiguous_without_province(result):
    assert result["gwangjuSi"] is None
    assert result["gyeonggiGwangju"] == "경기 광주시"


def test_joint_education_office_is_not_forced_to_one_city(result):
    assert result["jointOffice"] is None


def test_city_name_with_institution_suffix(result):
    assert result["university"] == "전남 순천시"
    assert result["seongnam"] == "경기 성남시"


def test_merged_city_is_left_unresolved(result):
    assert result["mergedCity"] is None


def test_institution_hq_and_branch(result):
    assert result["hq"] == "대전"
    assert result["branch"] is None       # 지청은 본부 주소로 보내지 않는다


def test_institution_order_and_length(result):
    assert result["firstMentioned"] == "과학기술정보통신부"
    assert result["longerName"] == "코레일유통"


def test_ascii_keyword_matches_whole_word_only(result):
    assert result["asciiWord"] is None


def test_special_city_names_are_read(result):
    assert result["specialCity"] == "경기 화성시"
    assert result["specialSuwon"] == "경기 수원시"


def test_district_never_leaves_the_case_region(result):
    """화성 도구를 광진구가 포팅한 경기 사례가 경기 아래 '광진구'로 나오던 문제(2026-09-27 사용자 지적)"""
    assert result["portedCase"] == "경기 화성시"
    assert result["otherRegionOnly"] is None


def test_special_city_label(result):
    assert result["labelHwaseong"] == "화성특례시"
    assert result["labelChangwon"] == "창원특례시"
    assert result["labelPlain"] == "성남시"
