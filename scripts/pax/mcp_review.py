"""MCP 보안 검증 원장 — 스키마·대상 추출 (스펙: 2026-08-28-mcp-security-review-design.md).

공개 산출물에 악용 가능 상세를 싣지 않는다는 원칙이 이 모듈의 검증 규칙에 반영된다:
verdict는 5종만, 축 이름은 AXES만 허용해 임의 필드로 상세가 새는 것을 막는다.
"""
import json
import re
from pathlib import Path

VERDICTS = frozenset(["통과", "주의", "심각(비공개 처리 중)", "미검증", "해당 없음"])
AXES = ("permission_surface", "secrets", "supply_chain", "injection", "data_flow", "hygiene")
OVERALLS = frozenset(["양호", "주의", "심각(비공개 처리 중)", "부분 검증", "미검증"])

RE_REPO = re.compile(r"https://(github\.com|gitlab\.aigov\.go\.kr)/[\w.\-]+/[\w.\-]+")


def is_mcp_case(case: dict) -> bool:
    hay = case.get("title", "") + " " + " ".join(case.get("tags", []))
    return "MCP" in hay.upper()


def repo_of(case: dict) -> str | None:
    """저장소 URL 우선(link→case_url→mirror_url 중 github/공공깃랩), 없으면 None(코드 비공개)."""
    for key in ("link", "case_url", "mirror_url"):
        url = case.get(key) or ""
        if RE_REPO.match(url.rstrip("/")):
            return url.rstrip("/")
    return None


def mcp_targets(cases: list[dict]) -> list[dict]:
    return [{"case_id": c["id"], "title": c.get("title", ""), "repo": repo_of(c)}
            for c in cases if is_mcp_case(c)]


def validate_review(review: dict, case_ids: set) -> None:
    if review.get("case_id") not in case_ids:
        raise ValueError(f"알 수 없는 case_id: {review.get('case_id')}")
    axes = review.get("axes", {})
    for name, ax in axes.items():
        if name not in AXES:
            raise ValueError(f"허용되지 않은 axes 키: {name}")
        if ax.get("verdict") not in VERDICTS:
            raise ValueError(f"verdict 값 오류({name}): {ax.get('verdict')}")
        if "note" not in ax:
            raise ValueError(f"note 누락: {name}")
    overall = review.get("overall")
    if overall is not None and overall not in OVERALLS:
        raise ValueError(f"overall 값 오류: {overall}")


def load_reviews(path: Path, case_ids: set) -> dict:
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    for r in doc.get("reviews", []):
        validate_review(r, case_ids)
    return doc


def save_reviews(path: Path, doc: dict) -> None:
    Path(path).write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8")
