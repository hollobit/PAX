import pytest

from conftest import make_case
from pax.ledger import LedgerError, check_ledgers, require_valid_cases


def _case(i):
    return make_case(id=f"{i:016x}", title=f"사례 {i}")


def _add(no, cid):
    return {"no": no, "id": cid}


def test_clean_ledgers_have_no_problems():
    cases = [_case(1), _case(2)]
    evals = [{"id": c["id"]} for c in cases]
    assert check_ledgers(cases, evals, [_add(71, cases[1]["id"])], []) == []


def test_duplicate_and_orphan_entries_are_reported():
    cases = [_case(1), _case(1), _case(2)]
    evals = [{"id": _case(1)["id"]}, {"id": "ffffffffffffffff"}]
    additions = [_add(71, _case(1)["id"]), _add(71, _case(1)["id"]), _add(72, "eeeeeeeeeeeeeeee")]
    problems = "\n".join(check_ledgers(cases, evals, additions, []))
    assert "사례 id 중복" in problems
    assert "평가 추가분 id 중복" in problems
    assert "평가 추가분 no 중복: 71" in problems
    assert "평가 추가분이 없는 사례를 가리킴: eeeeeeeeeeeeeeee" in problems
    assert "평가 없는 사례" in problems          # _case(2)
    assert "사례에 없는 평가: ffffffffffffffff" in problems


def test_schema_errors_and_bad_reviews_are_reported():
    bad = _case(3)
    bad["org_type"] = "없는 유형"
    review = {"case_id": "0000000000000009"}  # 필수 필드도 없고 사례에도 없음
    problems = check_ledgers([bad], [{"id": bad["id"]}], [], [review])
    assert any(p.startswith(f"사례 {bad['id']} 스키마") for p in problems)
    assert any(p.startswith("MCP 검증") for p in problems)


def test_require_valid_cases_blocks_writing_a_broken_ledger():
    # 원장 전체를 다시 쓰는 스크립트(라이선스·헬스 점검)는 쓰기 전에 이 검사를 거친다
    good = {"cases": [_case(1)]}
    require_valid_cases(good)
    bad = {"cases": [_case(1), {**_case(2), "source": "facebook"}]}
    with pytest.raises(LedgerError):
        require_valid_cases(bad)


def test_eval_additions_duplicates_are_skipped_not_appended_twice():
    import build_eval_data as bed
    base = [{"id": "a"}]
    fields = {f: "x" for f in bed.FIELDS}
    additions = [{**fields, "id": "b", "no": 71}, {**fields, "id": "b", "no": 72}, {**fields, "id": "a", "no": 73}]
    merged, warnings = bed.merge_additions(base, additions)
    assert [c["id"] for c in merged] == ["a", "b"]
    assert any("b" in w and "중복" in w for w in warnings)
    assert any("a" in w and "엑셀" in w for w in warnings)


def test_new_case_with_eval_addition_passes_input_stage_before_build():
    # 절차: 병합 → 평가 추가분 추가 → pax.run. 첫 단계에서는 evaluations.json이 아직 옛것이다.
    old = [_case(1), _case(2)]
    new = _case(3)
    stale_evals = [{"id": c["id"]} for c in old]
    additions = [_add(71, new["id"])]
    assert check_ledgers(old + [new], stale_evals, additions, [], stage="inputs") == []
    # 빌드 뒤 대조에서는 평가 파일에 없으면 잡는다(빌드가 추가분을 반영하지 못한 경우)
    built = check_ledgers(old + [new], stale_evals, additions, [], stage="built")
    assert any("평가 없는 사례" in p for p in built)


def test_input_stage_still_catches_a_forgotten_eval_addition():
    old = [_case(1)]
    new = _case(2)
    problems = check_ledgers(old + [new], [{"id": old[0]["id"]}], [], [], stage="inputs")
    assert any("평가 추가분이 없는 사례" in p and new["id"] in p for p in problems)


def test_collection_flow_on_real_ledgers_passes_both_stages():
    """수집 한 회차를 실제 원장 사본으로 흉내 낸다: 병합 → 추가분 → (inputs) → build_eval_data → (built)."""
    import build_eval_data as bed
    from pax.ledger import ADDITIONS, CASES, EVALUATIONS
    from pax.jsonio import read_json
    cases = read_json(CASES)["cases"]
    evals = read_json(EVALUATIONS)["cases"]
    additions = read_json(ADDITIONS)
    assert check_ledgers(cases, evals, additions, []) == []  # 커밋된 상태는 깨끗하다

    new = make_case(id="f" * 16, title="이번 회차 새 사례")
    template = {k: v for k, v in additions[-1].items() if k not in ("id", "no")}
    add = {**template, "id": new["id"], "no": max(a["no"] for a in additions) + 1}
    cases2, additions2 = cases + [new], additions + [add]
    assert check_ledgers(cases2, evals, additions2, [], stage="inputs") == []
    rebuilt, _ = bed.merge_additions([e for e in evals if e["id"] not in {a["id"] for a in additions}], additions2)
    assert check_ledgers(cases2, rebuilt, additions2, [], stage="built") == []
