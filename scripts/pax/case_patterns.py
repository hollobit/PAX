"""사례 상세 페이지의 '디자인 패턴 분석' 구역 — 『모두의 공공AX 디자인 패턴』(PAX-DP)의 사례별 태깅과 패턴 카탈로그.

data/patterns/case_patterns.json(사례별 판정)과 data/patterns/catalog.json(패턴 107종)을 읽어
① 판정 요약(업무 패턴·서비스 유형·전이 단계) ② 층별 부품과 배선·안티패턴 ③ 판정 근거
④ 구현 가이드(주 패턴의 구현 단계·점검표·환경 조건·주의점, 보완할 필수 부품, 피해야 할 안티패턴)
⑤ 쓰인 패턴의 상세(펼치기, 웹북 절 링크)를 정적 HTML로 만든다. 카탈로그에 없는 id도 이름 없이 보여 준다.
"""
from __future__ import annotations

from pax.case_details import esc

LAYER_NAMES = {"B": "업무 컴포넌트", "B′": "제어 흐름", "A": "공통 서비스", "C": "운영 컴포넌트", "S": "보안 패턴",
               "F": "상호작용 패턴", "D": "서비스 블록", "X": "안티패턴"}


def _layer(pid: str) -> str:
    if pid.startswith("B′"):
        return "Bp"
    return pid[:1] if pid[:1] in "BACSFDX" else "etc"


class _Ctx:
    def __init__(self, catalog: dict):
        self.cat = catalog.get("patterns", {})
        self.used: list[str] = []

    def chip(self, pid: str, note: str = "") -> str:
        if pid not in self.used:
            self.used.append(pid)
        p = self.cat.get(pid, {})
        label = f"{pid} {p['name']}" if p.get("name") else pid
        extra = f' <span class="dp-chip__note">{esc(note)}</span>' if note else ""
        title = esc(p.get("summary", ""))
        return f'<a class="dp-chip dp-chip--{_layer(pid)}" href="#pat-{esc(pid)}" title="{title}">{esc(label)}{extra}</a>'

    def chips(self, ids, note: str = "") -> str:
        return " ".join(self.chip(i, note) for i in ids or [])


def _ul(items, cls="") -> str:
    items = [i for i in items or [] if i]
    if not items:
        return ""
    c = f' class="{cls}"' if cls else ""
    return f"<ul{c}>" + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul>"


def _reference(ref, cx: _Ctx) -> str:
    """참조 구현 후보 — 원본은 문자열이거나 {component, reason} 객체(또는 그 목록)."""
    if not ref:
        return ""
    if isinstance(ref, list):
        return "<br>".join(filter(None, (_reference(r, cx) for r in ref)))
    if isinstance(ref, dict):
        comp = ref.get("component") or ref.get("id")
        reason = esc(ref.get("reason") or "")
        return (cx.chip(comp) + " " if comp else "") + reason
    return esc(str(ref))


def _rows(tag: dict, cx: _Ctx) -> list[tuple[str, str]]:
    op, sec, it = tag.get("operational") or {}, tag.get("security") or {}, tag.get("interaction") or {}
    rows = [
        ("제어 흐름(B′)", cx.chips(tag.get("control_flow"))),
        ("공통 서비스(A)", " ".join(filter(None, [cx.chips(tag.get("platform")), cx.chips(tag.get("platform_planned"), "계획")]))),
        ("운영(C)", " ".join(filter(None, [cx.chips(op.get("present")), cx.chips(op.get("implemented"), "구현 확인"),
                                         cx.chips(op.get("planned"), "계획")]))),
        ("보안(S)", " ".join(filter(None, [cx.chips(sec.get("present")), cx.chips(sec.get("implemented"), "구현 확인"),
                                         cx.chips(sec.get("structural"), "구조적"), cx.chips(sec.get("planned"), "계획")]))),
        ("신뢰할 수 없는 입력", esc(" · ".join(sec.get("untrusted_inputs") or []))),
        ("상호작용(F)", " ".join(filter(None, [cx.chips(it.get("present")), cx.chips(it.get("planned"), "계획")]))),
        ("서비스 블록(D)", cx.chips(tag.get("blocks"))),
        ("부품 배선", " · ".join(esc(w.replace("→", " → ")) for w in tag.get("wiring") or [])),
        ("안티패턴(X)", cx.chips(tag.get("anti_patterns"))),
        ("참조 구현 후보", _reference(tag.get("reference_candidate"), cx)),
    ]
    return [(k, v) for k, v in rows if v]


def _summary(tag: dict, cx: _Ctx) -> str:
    wf = tag.get("workflow") or {}
    tr = tag.get("transition") or {}
    parts = []
    if wf.get("primary"):
        sec = cx.chips(wf.get("secondary"))
        parts.append(f'<p class="dp-lead"><span class="dp-lead__label">업무 패턴</span> {cx.chip(wf["primary"])}'
                     + (f" <span class=\"dp-lead__sub\">보조</span> {sec}" if sec else "")
                     + (f' <span class="dp-lead__sub">변형: {esc(wf["variant"])}</span>' if wf.get("variant") else "") + "</p>")
    facts = [f"서비스 유형 {esc(tag['service_type'])}" if tag.get("service_type") else "",
             f"전이 단계 {esc(tr['stage'])}" if tr.get("stage") else "",
             f"걸림돌 {esc(tr['blocker'])}" if tr.get("blocker") else "",
             f"판정 카탈로그 {esc(tag['catalogue_version'])}" if tag.get("catalogue_version") else ""]
    facts = [f for f in facts if f]
    if facts:
        parts.append(f'<p class="case-page__meta">{" · ".join(facts)}</p>')
    return "".join(parts)


def _guide(tag: dict, cx: _Ctx) -> str:
    out = []
    primary = (tag.get("workflow") or {}).get("primary")
    p = cx.cat.get(primary or "", {})
    if p:
        usage = p.get("usage") or {}
        cons = p.get("consequences") or {}
        block = [f'<h4 class="dp-h4">주 패턴 {cx.chip(primary)}을 구현할 때</h4>']
        if usage.get("steps"):
            block.append('<p class="dp-label">구현 단계</p><ol class="dp-steps">'
                         + "".join(f"<li>{esc(s)}</li>" for s in usage["steps"]) + "</ol>")
        if usage.get("checklist"):
            block.append('<p class="dp-label">점검표</p>' + _ul(usage["checklist"], "dp-check"))
        if p.get("environment"):
            block.append(f'<p class="dp-label">환경 조건</p><p class="dp-text">{esc(p["environment"])}</p>')
        if cons.get("drawbacks"):
            block.append('<p class="dp-label">주의할 점</p>' + _ul(cons["drawbacks"]))
        if usage.get("wiring_example"):
            block.append(f'<p class="dp-label">기본 배선 예</p><p class="dp-text">{esc(usage["wiring_example"])}</p>')
        out.append("".join(block))
    missing = tag.get("missing_required") or []
    if missing:
        items = "".join(f"<li>{cx.chip(m)} {esc(cx.cat.get(m, {}).get('summary', ''))}</li>" for m in missing)
        out.append('<h4 class="dp-h4">보완이 필요한 필수 부품</h4>'
                   '<p class="dp-text">이 조합에서 카탈로그가 함께 갖추라고 권하는 부품 가운데 아직 확인되지 않은 것이다.</p>'
                   f'<ul class="dp-list">{items}</ul>')
    anti = list(dict.fromkeys((tag.get("anti_patterns") or []) + (p.get("anti_patterns") or [])))
    if anti:
        items = []
        for a in anti:
            x = cx.cat.get(a, {})
            fix = f' <span class="dp-fix">대처: {esc(x["solution"])}</span>' if x.get("solution") else ""
            mark = " (이 사례에서 확인)" if a in (tag.get("anti_patterns") or []) else ""
            items.append(f"<li>{cx.chip(a)}{esc(mark)} {esc(x.get('summary', ''))}{fix}</li>")
        out.append(f'<h4 class="dp-h4">피해야 할 안티패턴</h4><ul class="dp-list">{"".join(items)}</ul>')
    return "".join(out)


def _detail(pid: str, cx: _Ctx) -> str:
    p = cx.cat.get(pid)
    if not p:
        return ""
    layer = LAYER_NAMES.get(p.get("layer", ""), p.get("layer", ""))
    cons = p.get("consequences") or {}
    body = [f'<p class="dp-text">{esc(p.get("summary", ""))}</p>']
    if p.get("solution"):
        body.append(f'<p class="dp-label">해법</p><p class="dp-text">{esc(p["solution"])}</p>')
    if p.get("when_to_use"):
        body.append('<p class="dp-label">이럴 때 쓴다</p>' + _ul(p["when_to_use"]))
    if p.get("when_not_to_use"):
        body.append('<p class="dp-label">이럴 때는 쓰지 않는다</p>' + _ul(p["when_not_to_use"]))
    if cons.get("benefits"):
        body.append('<p class="dp-label">얻는 것</p>' + _ul(cons["benefits"]))
    if (p.get("usage") or {}).get("checklist"):
        body.append('<p class="dp-label">점검표</p>' + _ul(p["usage"]["checklist"], "dp-check"))
    if p.get("related"):
        rel = " · ".join(f"{esc(r.get('id') or '')} {esc(r.get('relation', ''))}" for r in p["related"] if isinstance(r, dict))
        body.append(f'<p class="dp-label">관련 부품</p><p class="dp-text">{rel}</p>')
    if p.get("resources"):
        body.append(f'<p class="dp-label">참고 자료</p><p class="dp-text">{esc(" · ".join(p["resources"]))}</p>')
    if p.get("url"):
        body.append(f'<p class="dp-text"><a href="{esc(p["url"])}" target="_blank" rel="noopener">웹북에서 전체 프로필 보기 ↗</a></p>')
    return (f'<details class="dp-detail" id="pat-{esc(pid)}"><summary><b>{esc(pid)} {esc(p.get("name", ""))}</b>'
            f' <span class="dp-detail__layer">{esc(layer)}</span></summary>{"".join(body)}</details>')


def pattern_section(case_id: str, tag: dict | None, catalog: dict | None) -> str:
    """카탈로그가 없으면 빈 문자열(구역을 만들지 않음), 태깅이 없으면 안내 한 줄."""
    if not catalog:
        return ""
    book = esc(catalog.get("book_url", ""))
    head = ('\n    <section class="obs-section" id="design-pattern">\n'
            '      <h2 class="obs-heading">디자인 패턴 분석</h2>\n')
    src = (f'<p class="obs-note"><a href="{book}" target="_blank" rel="noopener">『모두의 공공AX 디자인 패턴』</a> '
           f'카탈로그 {esc(catalog.get("version", ""))} 기준 — 사례를 기관이 함께 쓰는 AI 부품과 그 조립으로 읽은 결과입니다.</p>')
    if not tag:
        return (head + '      <p class="obs-note">이 사례는 아직 디자인 패턴 분석 전입니다. 패턴 카탈로그는 '
                f'<a href="{book}" target="_blank" rel="noopener">웹북</a>에서 볼 수 있습니다.</p>\n    </section>')
    cx = _Ctx(catalog)
    summary = _summary(tag, cx)
    rows = "".join(f"<dt>{esc(k)}</dt><dd>{v}</dd>" for k, v in _rows(tag, cx))
    rationale = (f'<p class="dp-label">판정 근거</p><p class="dp-text">{esc(tag["rationale"])}</p>'
                 if tag.get("rationale") else "")
    guide = _guide(tag, cx)
    details = "".join(_detail(pid, cx) for pid in cx.used)
    return (head + f"      {src}{summary}"
            + (f'<dl class="case-page__details dp-rows">{rows}</dl>' if rows else "") + rationale
            + (f'<h3 class="dp-h3">구현 가이드</h3>{guide}' if guide else "")
            + (f'<h3 class="dp-h3">이 사례에 쓰인 패턴</h3><div class="dp-details">{details}</div>' if details else "")
            + "\n    </section>")
