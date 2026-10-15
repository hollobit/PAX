"""사례 상세 페이지의 디자인 패턴 분석 구역 — 동기화(sync_patterns)와 렌더(pax.case_patterns)."""
import json

import sync_patterns as sp
from pax.case_patterns import pattern_section

CATALOG = {
    "version": "v0.7.1", "book_url": "https://hollobit.github.io/PAX-DP/",
    "patterns": {
        "B1": {"id": "B1", "name": "코파일럿", "layer": "B", "summary": "AI가 초안을 놓고 사람이 확정한다.",
               "solution": "초안을 F2로 내고 C1에서 확정한다.", "when_to_use": ["서식이 정해진 문서"],
               "when_not_to_use": ["접지가 핵심일 때(B3)"],
               "usage": {"steps": ["규범을 A9 스킬로 만든다.", "C9 평가 세트를 만든다."], "checklist": ["담당자가 확정하는가"]},
               "environment": "행정망이면 A2 내부망 프록시.", "consequences": {"benefits": ["시간 단축"], "drawbacks": ["전건 검토가 남음"]},
               "related": [{"id": "C1", "relation": "짝"}], "anti_patterns": ["X4"], "url": "https://hollobit.github.io/PAX-DP/ch05.html#p-B1"},
        "C1": {"id": "C1", "name": "검토 큐", "layer": "C", "summary": "담당자가 확인·확정한다.",
               "url": "https://hollobit.github.io/PAX-DP/ch08.html#p-C1"},
        "A9": {"id": "A9", "name": "업무 규범 스킬", "layer": "A", "summary": "서식·문체를 스킬로 고정한다."},
        "X4": {"id": "X4", "name": "상용 API 직결", "layer": "X", "summary": "민감 자료를 상용 API로 바로 보낸다.",
               "solution": "A2 게이트웨이를 거친다."},
    },
}
TAG = {
    "workflow": {"primary": "B1", "secondary": [], "variant": "스킬 코파일럿"},
    "control_flow": [], "platform": ["A9"], "platform_planned": [],
    "operational": {"present": ["C1"], "planned": [], "implemented": []},
    "security": {"present": [], "planned": [], "implemented": [], "structural": [], "untrusted_inputs": ["외부 <공개> 문서"]},
    "interaction": {"present": [], "planned": []}, "blocks": [], "service_type": "④ 내부 문서·기안",
    "transition": {"stage": "개인 사용", "blocker": None}, "wiring": ["A9→B1", "B1→C1"],
    "anti_patterns": ["X4"], "reference_candidate": None, "missing_required": ["A9", "ZZ9"],
    "rationale": "초안을 담당자가 확정하는 구조라 B1로 판정했다.", "catalogue_version": "v0.6",
}


def test_section_shows_tagging_layers_and_links():
    html = pattern_section("a" * 16, TAG, CATALOG)
    assert 'id="design-pattern"' in html
    assert '<a class="dp-chip dp-chip--B" href="#pat-B1"' in html and "B1 코파일럿" in html
    assert "스킬 코파일럿" in html and "④ 내부 문서·기안" in html and "개인 사용" in html
    assert "A9 → B1" in html and "B1 → C1" in html
    assert "초안을 담당자가 확정하는 구조라 B1로 판정했다." in html
    assert "외부 &lt;공개&gt; 문서" in html  # 텍스트는 이스케이프


def test_implementation_guide_uses_primary_pattern_and_missing_parts():
    html = pattern_section("a" * 16, TAG, CATALOG)
    assert "<li>규범을 A9 스킬로 만든다.</li>" in html and "<li>담당자가 확정하는가</li>" in html
    assert "행정망이면 A2 내부망 프록시." in html and "전건 검토가 남음" in html
    assert "보완이 필요한 필수 부품" in html and "서식·문체를 스킬로 고정한다." in html
    assert "ZZ9" in html  # 카탈로그에 없는 부품도 id는 보인다
    assert "상용 API 직결" in html and "A2 게이트웨이를 거친다." in html


def test_pattern_details_link_to_book_anchor():
    html = pattern_section("a" * 16, TAG, CATALOG)
    assert '<details class="dp-detail" id="pat-B1">' in html
    assert 'href="https://hollobit.github.io/PAX-DP/ch05.html#p-B1"' in html
    assert '<details class="dp-detail" id="pat-C1">' in html


def test_untagged_case_gets_short_note():
    html = pattern_section("b" * 16, None, CATALOG)
    assert "아직 디자인 패턴 분석 전" in html and "https://hollobit.github.io/PAX-DP/" in html


def test_no_catalog_means_no_section():
    assert pattern_section("a" * 16, TAG, None) == ""


def test_sync_drops_evidence_feedback_and_quoted_rationale():
    raw = {**TAG, "id": "a" * 16, "evidence": [{"quote": "원문"}], "catalogue_feedback": {"ambiguous": ["x"]},
           "environment": {"deployment_env": "미확인"}}
    out = sp.case_entry(raw)
    assert "evidence" not in out and "catalogue_feedback" not in out and "environment" not in out
    assert out["rationale"] == TAG["rationale"]
    quoted = sp.case_entry({**raw, "rationale": '원문의 "준수 설계"를 표방한다.'})
    assert "rationale" not in quoted


def test_sync_book_anchor_map():
    pages = {"ch05.html": '<div id="p-B1"></div><div id="p-Bp1"></div><b id="p-Bpm"></b>', "ch07.html": '<i id="p-A2_5"></i>'}
    m = sp.anchor_map(pages)
    assert m == {"B1": "ch05.html#p-B1", "B′1": "ch05.html#p-Bp1", "B′+": "ch05.html#p-Bpm", "A2.5": "ch07.html#p-A2_5"}


def test_sync_splits_joined_ids():
    out = sp.case_entry({**TAG, "security": {**TAG["security"], "present": ["S5|S6", "S1"]}})
    assert out["security"]["present"] == ["S5", "S6", "S1"]
    assert out["security"]["untrusted_inputs"] == ["외부 <공개> 문서"]


def test_sync_catalog_entry_keeps_public_fields_only():
    item = {"id": "B1", "name": "코파일럿", "layer": "B", "summary": "s", "examples": [{"ref": "x"}],
            "sources": ["카탈로그 §6"], "usage": {"steps": ["a"], "checklist": ["b"], "wiring_example": "w"}}
    out = sp.catalog_entry(item, {"B1": "ch05.html#p-B1"}, "https://hollobit.github.io/PAX-DP/")
    assert "examples" not in out and "sources" not in out
    assert out["url"] == "https://hollobit.github.io/PAX-DP/ch05.html#p-B1"
    assert json.dumps(out, ensure_ascii=False)


def test_reference_candidate_object_renders_as_chip_and_reason():
    tag = {**TAG, "reference_candidate": {"component": "C1", "reason": "검토 큐의 명확한 구현체"}}
    html = pattern_section("a" * 16, tag, CATALOG)
    assert "{'component'" not in html
    assert 'href="#pat-C1"' in html and "검토 큐의 명확한 구현체" in html
