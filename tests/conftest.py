import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))


def make_case(**overrides) -> dict:
    base = {
        "id": "a" * 16,
        "date": "2026-08-05",
        "collected_at": "2026-08-06",
        "source": "threads",
        "link": "https://www.threads.com/@user/post/abc",
        "org": "서울시",
        "org_type": "광역지자체",
        "title": "AI 민원 상담 챗봇 도입",
        "summary": "서울시가 민원 응대에 LLM 기반 챗봇을 도입해 상담 대기 시간을 줄였다.",
        "tags": ["민원", "LLM"],
    }
    return {**base, **overrides}
