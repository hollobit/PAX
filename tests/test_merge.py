import copy
import json
import subprocess
import sys
from pathlib import Path

from conftest import make_case
from pax.merge import make_id, merge_cases, normalize_text, prepare_candidate


def make_candidate(**overrides) -> dict:
    cand = make_case(**overrides)
    del cand["id"]
    cand.setdefault("raw_text", "서울시 챗봇 도입 원문 텍스트")
    return cand


def test_normalize_collapses_whitespace_and_nfc():
    assert normalize_text("  안녕\n\n세상  ") == "안녕 세상"


def test_make_id_deterministic_and_format():
    a = make_id("threads", "원문  텍스트")
    b = make_id("threads", "원문 텍스트")   # 공백 차이는 무시
    assert a == b and len(a) == 16 and int(a, 16) >= 0


def test_make_id_differs_by_source():
    assert make_id("threads", "같은 글") != make_id("kakao", "같은 글")


def test_prepare_candidate_fills_id_and_strips_raw_text():
    cand = make_candidate()
    prepared = prepare_candidate(cand)
    assert prepared["id"] == make_id(cand["source"], cand["raw_text"])
    assert "raw_text" not in prepared
    assert "raw_text" in cand  # 입력 불변


def test_merge_appends_valid_candidate():
    doc = {"updated_at": None, "cases": []}
    new_doc, rejected = merge_cases(doc, [make_candidate()], "2026-08-06T09:00:00+09:00")
    assert len(new_doc["cases"]) == 1 and rejected == []
    assert new_doc["updated_at"] == "2026-08-06T09:00:00+09:00"


def test_merge_is_append_only_and_immutable():
    existing = make_case(id=make_id("threads", "기존 글"))
    doc = {"updated_at": "old", "cases": [existing]}
    snapshot = copy.deepcopy(doc)
    new_doc, _ = merge_cases(doc, [make_candidate()], "now")
    assert doc == snapshot                     # 입력 불변
    assert new_doc["cases"][0] == existing     # 기존 항목 보존


def test_merge_skips_duplicate_of_existing():
    cand = make_candidate(raw_text="같은 원문")
    doc = {"updated_at": None, "cases": [prepare_candidate(cand)]}
    new_doc, rejected = merge_cases(doc, [make_candidate(raw_text="같은  원문")], "now")
    assert len(new_doc["cases"]) == 1 and rejected == []


def test_merge_skips_duplicate_within_batch():
    doc = {"updated_at": None, "cases": []}
    cands = [make_candidate(raw_text="한 글"), make_candidate(raw_text="한  글")]
    new_doc, _ = merge_cases(doc, cands, "now")
    assert len(new_doc["cases"]) == 1


def test_merge_rejects_invalid_candidate():
    doc = {"updated_at": None, "cases": []}
    bad = make_candidate(org_type="사기업")
    new_doc, rejected = merge_cases(doc, [bad], "now")
    assert new_doc["cases"] == [] and len(rejected) == 1
    assert rejected[0]["errors"]


def test_merge_rejects_privacy_violation():
    doc = {"updated_at": None, "cases": []}
    bad = make_candidate(summary="문의: 010-1234-5678")
    _, rejected = merge_cases(doc, [bad], "now")
    assert len(rejected) == 1


def test_cli_merges_incoming_file(tmp_path):
    root = tmp_path
    (root / "data").mkdir()
    (root / "data" / "cases.json").write_text(
        json.dumps({"updated_at": None, "cases": []}), encoding="utf-8")
    incoming = root / "incoming.json"
    incoming.write_text(json.dumps([make_candidate()], ensure_ascii=False),
                        encoding="utf-8")
    scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
    result = subprocess.run(
        [sys.executable, "-m", "pax.merge", str(incoming)],
        cwd=root, capture_output=True, text=True,
        env={"PYTHONPATH": str(scripts_dir), "PATH": "/usr/bin:/bin"},
    )
    assert result.returncode == 0, result.stderr
    saved = json.loads((root / "data" / "cases.json").read_text(encoding="utf-8"))
    assert len(saved["cases"]) == 1
