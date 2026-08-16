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
