import json
import pytest

from pax.mcp_review import AXES, VERDICTS, load_reviews, mcp_targets, validate_review


def test_mcp_targets_selects_mcp_cases():
    cases = [
        {"id": "a", "title": "건축HUB MCP", "tags": [], "link": "https://github.com/x/y"},
        {"id": "b", "title": "일반 도구", "tags": ["웹앱"], "link": "https://ex.com"},
        {"id": "c", "title": "원격 도구", "tags": ["MCP"], "link": "https://svc.kr/"},
    ]
    t = mcp_targets(cases)
    ids = [x["case_id"] for x in t]
    assert "a" in ids and "c" in ids and "b" not in ids
    assert next(x for x in t if x["case_id"] == "a")["repo"] == "https://github.com/x/y"
    assert next(x for x in t if x["case_id"] == "c")["repo"] is None


def test_mcp_targets_prefers_repo_over_service():
    cases = [{"id": "d", "title": "X MCP", "tags": [],
              "link": "https://svc.kr/", "case_url": "https://gitlab.aigov.go.kr/g/r"}]
    assert mcp_targets(cases)[0]["repo"] == "https://gitlab.aigov.go.kr/g/r"


def test_validate_review_rejects_bad_verdict():
    r = {"case_id": "a", "axes": {"secrets": {"verdict": "안전함", "note": ""}}}
    with pytest.raises(ValueError, match="verdict"):
        validate_review(r, {"a"})


def test_validate_review_rejects_unknown_case_and_axis():
    with pytest.raises(ValueError, match="case_id"):
        validate_review({"case_id": "ghost", "axes": {}}, {"a"})
    with pytest.raises(ValueError, match="axes"):
        validate_review({"case_id": "a", "axes": {"nope": {"verdict": "통과", "note": ""}}}, {"a"})


def test_load_reviews_validates(tmp_path):
    p = tmp_path / "r.json"
    p.write_text(json.dumps({"reviews": [{"case_id": "a", "axes": {
        "secrets": {"verdict": "통과", "note": "ok"}}}]}), encoding="utf-8")
    doc = load_reviews(p, {"a"})
    assert doc["reviews"][0]["case_id"] == "a"
