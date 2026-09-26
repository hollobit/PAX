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
