"""원장 교차 점검 — 사례·평가·평가 추가분·MCP 검증이 서로 맞는지 본다.

병합(pax.merge)만 사례를 검증하고, 라이선스·헬스 점검처럼 원장 전체를 다시 쓰는 스크립트와
사람이 손으로 늘리는 평가 추가분에는 검사가 없었다. 이 모듈이 그 빈틈을 한 곳에서 막는다:
    PYTHONPATH=scripts python3 -m pax.ledger   # 문제 목록, 있으면 종료 코드 1
check_repo.py(CI)와 pax.run post-collect의 첫 단계가 부른다.
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

from pax.jsonio import load_json, read_json
from pax.mcp_review import validate_review
from pax.schema import validate_case

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "data" / "cases.json"
EVALUATIONS = ROOT / "site" / "data" / "evaluations.json"
ADDITIONS = ROOT / "docs" / "native" / "eval_additions.json"
REVIEWS = ROOT / "data" / "mcp_reviews.json"


class LedgerError(ValueError):
    pass


def _dups(values) -> list:
    return sorted(v for v, n in Counter(values).items() if n > 1)


def check_ledgers(cases: list, evaluations: list, additions: list, reviews: list) -> list[str]:
    problems = []
    case_ids = [c.get("id") for c in cases]
    known = set(case_ids)
    for d in _dups(case_ids):
        problems.append(f"사례 id 중복: {d}")
    for c in cases:
        errors = validate_case(c)
        if errors:
            problems.append(f"사례 {c.get('id')} 스키마: {'; '.join(errors)}")

    add_ids = [a.get("id") for a in additions]
    for d in _dups(add_ids):
        problems.append(f"평가 추가분 id 중복: {d}")
    for d in _dups(a.get("no") for a in additions):
        problems.append(f"평가 추가분 no 중복: {d}")
    for cid in sorted(set(add_ids) - known):
        problems.append(f"평가 추가분이 없는 사례를 가리킴: {cid}")

    eval_ids = {e.get("id") for e in evaluations}
    for cid in sorted(known - eval_ids):
        problems.append(f"평가 없는 사례: {cid} — eval_additions.json에 항목을 더하고 build_eval_data를 돌린다")
    for cid in sorted(eval_ids - known):
        problems.append(f"사례에 없는 평가: {cid}")

    for r in reviews:
        try:
            validate_review(r, known)
        except ValueError as e:
            problems.append(f"MCP 검증 {r.get('case_id')}: {e}")
    return problems


def require_valid_cases(doc: dict) -> None:
    """원장 전체를 다시 쓰기 전에 부른다 — 한 건이라도 스키마가 깨졌으면 쓰지 않는다."""
    cases = doc.get("cases", [])
    problems = [p for p in check_ledgers(cases, [{"id": c.get("id")} for c in cases], [], [])]
    if problems:
        raise LedgerError("사례 원장을 쓰지 않음 — " + " / ".join(problems[:5]))


def check_repository() -> list[str]:
    cases = read_json(CASES)["cases"]
    evaluations = load_json(EVALUATIONS, default={}).get("cases", [])
    additions = load_json(ADDITIONS, default=[])
    reviews = load_json(REVIEWS, default={}).get("reviews", [])
    return check_ledgers(cases, evaluations, additions, reviews)


def main() -> int:
    problems = check_repository()
    for p in problems:
        print(p, file=sys.stderr)
    print(f"원장 점검: 문제 {len(problems)}건")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
