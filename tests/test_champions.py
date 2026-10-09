"""build_champions의 계정 추출·연결 규칙 테스트."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from build_champions import extract_accounts  # noqa: E402


def test_github_extraction():
    repo, threads = extract_accounts({"link": "https://github.com/foo/bar", "case_url": None})
    assert repo == {"github:foo"} and threads == set()


def test_gitlab_and_ghio():
    repo, _ = extract_accounts({
        "link": "https://gitlab.aigov.go.kr/user1/proj",
        "case_url": "https://user2.github.io/site/page.html"})
    assert repo == {"gitlab:user1", "github:user2"}


def test_threads_handle():
    repo, threads = extract_accounts({
        "link": "https://www.threads.com/@handle.x/post/ABC", "case_url": None})
    assert repo == set() and threads == {"threads:handle.x"}


def test_exclude_explore():
    repo, _ = extract_accounts({
        "link": "https://gitlab.aigov.go.kr/explore/projects/active", "case_url": None})
    assert repo == set()


def test_mixed_repo_and_threads():
    repo, threads = extract_accounts({
        "link": "https://www.threads.com/@sharer/post/X",
        "case_url": "https://github.com/dev/tool"})
    assert repo == {"github:dev"} and threads == {"threads:sharer"}


# --- 깃랩 표시명 분리·정규화 (2026-08-23 재검증) ---
from build_champions import clean_person_name, split_gitlab_name


def test_split_simple_org_name():
    assert split_gitlab_name("고용노동부 강기륜") == ("고용노동부", "강기륜")


def test_split_fire_station_suffix():
    assert split_gitlab_name("완주소방서 김무영") == ("완주소방서", "김무영")


def test_split_multi_token_org_path():
    org, name = split_gitlab_name("전남광주통합특별시 기획조정실 전략정책관 전략기획관실 김규범")
    assert name == "김규범"
    assert org == "전남광주통합특별시 기획조정실 전략정책관 전략기획관실"


def test_reversed_given_family_order():
    assert split_gitlab_name("진희 안") == (None, "안진희")
    assert split_gitlab_name("환철 신") == (None, "신환철")


def test_plain_name_untouched():
    assert split_gitlab_name("사진우") == (None, "사진우")
    assert split_gitlab_name("onpremisehuman") == (None, "onpremisehuman")


def test_reference_cases_excluded_from_champions():
    """민간(참고)·해외(참고) 사례의 계정은 챔피언으로 추출하지 않는다."""
    from build_champions import extract_accounts, is_champion_source
    ref = {"org_type": "해외(참고)", "link": "https://github.com/bigcorp/tool", "case_url": None}
    dom = {"org_type": "공직 개인", "link": "https://github.com/dev/tool", "case_url": None}
    assert not is_champion_source(ref)
    assert is_champion_source(dom)


def test_split_org_path_with_bureau_and_library():
    assert split_gitlab_name("경기도부천시 평생교육국 상동도서관 이완재") == (
        "경기도부천시 평생교육국 상동도서관", "이완재")


def test_split_leading_role_title():
    assert split_gitlab_name("안전관리자 이호진") == (None, "이호진")
    assert split_gitlab_name("정보보호 담당자 김철수") == (None, "김철수")


def test_split_org_only_account():
    assert split_gitlab_name("한국산업기술시험원") == ("한국산업기술시험원", "한국산업기술시험원")
    assert split_gitlab_name("김지원") == (None, "김지원")  # '원'으로 끝나는 세 글자 이름은 기관이 아니다


def test_clean_bilingual_names():
    assert clean_person_name("백상현 / Sanghyeon Baek") == "백상현"
    assert clean_person_name("서호성 (Hoseong Seo)") == "서호성"
    assert clean_person_name("Sanghyeon Baek / 백상현") == "백상현"
    assert clean_person_name("Chansung Park") == "Chansung Park"
    assert clean_person_name("모두의AI") == "모두의AI"
    assert clean_person_name("지식재산처 IP-AX 추진단") == "지식재산처 IP-AX 추진단"
