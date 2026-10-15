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


CAT2 = {**CATALOG, "constellation_url": "https://hollobit.github.io/PAX-DP/constellation/",
        "patterns": {**CATALOG["patterns"],
                     "B1": {**CATALOG["patterns"]["B1"], "usage_count": 120, "context": "형식이 정해진 문서 업무.",
                            "forces": ["초안 속도 vs 검토 시간"], "variants": [{"name": "스킬 코파일럿", "desc": "BYO + A9"}],
                            "structure": {"participants": [{"id": "A2", "name": "모델 서빙 계층", "role": "초안 생성"}]},
                            "examples": [{"ref": "PAX gov-report-skill", "note": "참조 구현"}],
                            "dir_url": "https://hollobit.github.io/PAX-DP/constellation/#dir-B1"}}}


def test_constellation_links_usage_env_and_directory_fields():
    tag = {**TAG, "env": ["배포:인터넷망", "권한:P1 산출물 생성"]}
    html = pattern_section("a" * 16, tag, CAT2)
    assert 'href="https://hollobit.github.io/PAX-DP/constellation/"' in html  # 구역 머리 링크
    assert "배포:인터넷망" in html and "권한:P1 산출물 생성" in html
    assert "PAX 사례 120건" in html
    assert "형식이 정해진 문서 업무." in html and "초안 속도 vs 검토 시간" in html
    assert "스킬 코파일럿" in html and "A2 모델 서빙 계층" in html and "PAX gov-report-skill" in html
    assert 'href="https://hollobit.github.io/PAX-DP/constellation/#dir-B1"' in html


def test_peer_cases_with_same_primary_pattern():
    peers = [("b" * 16, "같은 B1 <사례>"), ("c" * 16, "또 다른 사례")]
    html = pattern_section("a" * 16, TAG, CAT2, peers=peers)
    assert "같은 주 패턴(B1)을 쓰는 다른 사례" in html
    assert f'<a href="{"b" * 16}.html">같은 B1 &lt;사례&gt;</a>' in html


def test_sync_merges_constellation_usage_slug_and_env():
    data = {"usage": {"B|B1": 120, "Bp|B′1": 7, "E|배포:인터넷망": 3},
            "cases": [{"id": "a" * 16, "L": {"E": ["배포:인터넷망"]}}],
            "directory": {"layers": [{"id": "B", "name": "업무 컴포넌트", "desc": "d"}],
                          "entries": [{"id": "B1", "context": "맥락", "forces": ["f"], "examples": [{"ref": "r"}],
                                       "sources": ["내부"], "tagging": {"signals": ["s"]}}]}}
    patterns = {"B1": {"id": "B1"}, "B′1": {"id": "B′1"}}
    sp.merge_constellation(patterns, data, "https://x/constellation/")
    assert patterns["B1"]["usage_count"] == 120 and patterns["B′1"]["usage_count"] == 7
    assert patterns["B1"]["dir_url"] == "https://x/constellation/#dir-B1"
    assert patterns["B′1"]["dir_url"] == "https://x/constellation/#dir-Bp1"
    assert patterns["B1"]["context"] == "맥락" and patterns["B1"]["examples"] == [{"ref": "r"}]
    assert "sources" not in patterns["B1"] and "tagging" not in patterns["B1"]
    assert sp.case_env(data) == {"a" * 16: ["배포:인터넷망"]}


def test_composition_diagram_svg():
    from pax.case_pattern_svg import composition_svg
    tag = {**TAG, "platform_planned": ["A2"], "missing_required": ["C5"]}
    svg = composition_svg(tag, CAT2)
    assert svg.startswith('<svg') and 'role="img"' in svg and "<title>" in svg
    assert ">B1 코파일럿<" in svg and ">A9 업무 규범 스킬<" in svg and ">C1 검토 큐<" in svg
    assert 'data-state="planned"' in svg and 'data-state="missing"' in svg  # 계획·보완 필요는 점선
    assert svg.count('marker-end="url(#dp-arrow)"') == 2  # A9→B1, B1→C1
    assert 'href="#pat-B1"' in svg  # 노드를 누르면 아래 상세로


def test_section_includes_diagram_and_constellation_link():
    html = pattern_section("a" * 16, TAG, CAT2)
    assert '<figure class="dp-figure">' in html and "<svg" in html
    assert "패턴 성좌" in html


APPX_E = '''<h2>행정안전부·NIA</h2>
<h3 id="e-mois-2026">공공부문 AI 도입·활용 가이드</h3>
<p>행정안전부·NIA, 2026.6. 현행 핵심. 배포처: <a href="https://www.mois.go.kr/x?a=1&amp;b=2">보도자료</a></p>
<dl><dt><b>담은 내용</b></dt><dd>다섯 단계 과업.</dd>
<dt><b>쓰는 작업</b></dt><dd>사업계획서를 쓸 때 편다.</dd>
<dt><b>주의</b></dt><dd>구판은 참고만.</dd>
<dt><b>이어지는 패턴</b></dt><dd>RAG 우선은 <a class="pat" href="ch05.html#p-B3"><span class="pid">B3</span>지식 접지</a>와 <a href="ch08.html#p-C9"><span class="pid">C9</span>평가</a>.</dd></dl>
<h3 id="e-nis-guidebook">AI보안 가이드북</h3>
<p>국가정보원, 2025.1. 배포처 미확인.</p>
<dl><dt><b>이어지는 패턴</b></dt><dd><span class="pid">S1</span> 입력 검증과 <span class="pid">B3</span>.</dd></dl>'''


def test_sync_parses_guideline_appendix():
    g = sp.parse_guidelines(APPX_E, "https://x/PAX-DP/")
    assert [d["id"] for d in g] == ["e-mois-2026", "e-nis-guidebook"]
    a = g[0]
    assert a["title"] == "공공부문 AI 도입·활용 가이드" and a["group"] == "행정안전부·NIA"
    assert a["meta"].startswith("행정안전부·NIA, 2026.6.") and a["source_url"] == "https://www.mois.go.kr/x?a=1&b=2"
    assert a["task"] == "사업계획서를 쓸 때 편다." and a["caution"] == "구판은 참고만." and a["patterns"] == ["B3", "C9"]
    assert a["url"] == "https://x/PAX-DP/appx-e.html#e-mois-2026"
    assert "source_url" not in g[1] and g[1]["patterns"] == ["S1", "B3"]


GUIDES = [{"id": "e-mois-2026", "title": "공공부문 AI 도입·활용 가이드", "meta": "행정안전부·NIA, 2026.6.",
           "task": "사업계획서를 쓸 때 편다.", "caution": "구판은 참고만.", "patterns": ["B1", "C1"],
           "url": "https://x/appx-e.html#e-mois-2026", "source_url": "https://www.mois.go.kr/x"},
          {"id": "e-nis", "title": "AI보안 가이드북", "meta": "국가정보원", "patterns": ["S9"], "url": "https://x/appx-e.html#e-nis"}]


def test_related_guidelines_ranked_by_shared_patterns():
    cat = {**CAT2, "guidelines": GUIDES}
    html = pattern_section("a" * 16, TAG, cat)
    assert "관련 가이드라인" in html and "공공부문 AI 도입·활용 가이드" in html
    assert 'href="https://x/appx-e.html#e-mois-2026"' in html and 'href="https://www.mois.go.kr/x"' in html
    assert "사업계획서를 쓸 때 편다." in html
    assert "AI보안 가이드북" not in html.split("이 사례에 쓰인 패턴")[0]  # 이 사례 부품과 겹치지 않으면 빼다
