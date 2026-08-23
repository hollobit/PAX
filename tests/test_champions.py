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
from build_champions import split_gitlab_name


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
