import json

from build_mcp_review import build_public, compute_overall


def test_unresolved_disclosure_masked():
    ledger = {"reviews": [{"case_id": "a", "checked_at": "2026-08-28",
        "axes": {"secrets": {"verdict": "심각(비공개 처리 중)", "note": "이 노트는 나가면 안 됨"},
                 "hygiene": {"verdict": "통과", "note": "MIT"}},
        "disclosure": {"notified_at": "2026-08-29", "resolved": False}}]}
    out = build_public(ledger, {"a": {"title": "T", "stars": 1}})
    ax = out["reviews"][0]["axes"]["secrets"]
    assert ax["note"] == "비공개 처리 중 — 개발자에게 통보되었습니다"
    assert "나가면 안 됨" not in json.dumps(out, ensure_ascii=False)


def test_resolved_disclosure_passes_note():
    ledger = {"reviews": [{"case_id": "a", "checked_at": "2026-08-28",
        "axes": {"secrets": {"verdict": "통과", "note": "수정 확인(키 폐기·환경변수 전환)"}},
        "disclosure": {"notified_at": "d", "resolved": True}}]}
    out = build_public(ledger, {"a": {"title": "T"}})
    assert "수정 확인" in out["reviews"][0]["axes"]["secrets"]["note"]


def test_compute_overall_rules():
    assert compute_overall({"secrets": {"verdict": "심각(비공개 처리 중)"}}) == "심각(비공개 처리 중)"
    assert compute_overall({"a": {"verdict": "통과"}, "b": {"verdict": "주의"}}) == "주의"
    assert compute_overall({"a": {"verdict": "통과"}, "b": {"verdict": "해당 없음"}}) == "양호"
    assert compute_overall({"a": {"verdict": "통과"}, "b": {"verdict": "미검증"}}) == "부분 검증"


def test_summary_counts():
    ledger = {"reviews": [
        {"case_id": "a", "axes": {"x1": {"verdict": "통과", "note": ""}}, "disclosure": None},
        {"case_id": "b", "axes": {"supply_chain": {"verdict": "주의", "note": ""}}, "disclosure": None},
        {"case_id": "c", "axes": {"supply_chain": {"verdict": "주의", "note": ""}}, "disclosure": None},
    ]}
    out = build_public(ledger, {"a": {}, "b": {}, "c": {}})
    assert out["summary"]["counts"]["양호"] == 1
    assert out["summary"]["counts"]["주의"] == 2
    assert out["summary"]["top_warn_axis"] == "supply_chain"
