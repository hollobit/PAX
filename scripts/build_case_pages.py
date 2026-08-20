#!/usr/bin/env python3
"""사례별 정적 상세 페이지 생성 (로드맵 2-8).

site/case/<id>.html — og 태그를 갖춘 고정 페이지. "결재에 이 URL 하나만 붙이면 되는"
공유 단위이며, JS 미실행 크롤러·AI 에이전트도 본문을 읽을 수 있다(0-5의 완성).

사용: python3 scripts/build_case_pages.py  (매 병합 후 실행 — 전량 재생성, 수 초)
"""
import html
import json
from pathlib import Path

BASE = "https://hollobit.github.io/PAX"
OUT_DIR = Path("site/case")

TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — 모두의 공공AX</title>
  <meta name="description" content="{desc}">
  <link rel="canonical" href="{base}/case/{cid}.html">
  <meta property="og:type" content="article">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:url" content="{base}/case/{cid}.html">
  <meta property="og:site_name" content="모두의 공공AX 사례 아카이브">
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  <header class="site-header">
    <p class="eyebrow">PUBLIC SECTOR AX CASE · 사례 {cid}</p>
    <h1>{title}</h1>
    <nav class="site-nav" aria-label="주요 메뉴">
      <a href="../">사례 아카이브</a>
      <a href="../dashboard.html">AX 평가</a>
      <a href="../observatory.html">관측소</a>
      <a href="../playbook.html">전이 플레이북</a>
    </nav>
  </header>
  <main class="case-page">
    <section class="obs-section">
      <p class="case-page__meta">{org} · {org_type}{region} · {task} · {date} 게시</p>
      <p class="case-page__summary">{summary}</p>
      <p class="case-page__links">{links}</p>
    </section>
    <section class="obs-section">
      <h2 class="obs-heading">4축 평가</h2>
      {eval_table}
      <p class="obs-note">{rationale}</p>
    </section>
    <section class="obs-section">
      <h2 class="obs-heading">실무 도입 카드</h2>
      <div class="obs-cards">
        <div class="obs-card"><p class="obs-card__label">필요한 것</p><p class="obs-card__note">{needs}</p></div>
        <div class="obs-card"><p class="obs-card__label">첫 3단계</p><p class="obs-card__note">{steps}</p></div>
        <div class="obs-card"><p class="obs-card__label">주의사항</p><p class="obs-card__note">{cautions}</p></div>
      </div>
      <p class="obs-note">전이 절차(보안검토→품의→배포)는 <a href="../playbook.html">전이 플레이북</a>을 참고하세요.</p>
    </section>
    <section class="obs-section">
      <h2 class="obs-heading">비슷한 업무의 사례</h2>
      <ul class="case-page__related">{related}</ul>
    </section>
    <footer class="obs-note">
      <p>출처: 모두의 공공AX 사례 아카이브 · 자기선택 표본 · 근거 없는 항목은 '미확인'으로 표기 ·
      인용 시 이 페이지 URL을 사용하세요.</p>
    </footer>
  </main>
</body>
</html>
"""


def esc(s):
    return html.escape(str(s or ""), quote=True)


def build_needs(c):
    parts = []
    if c.get("runtime_env"):
        parts.append(f"실행환경: {c['runtime_env']}")
    if c.get("network_req"):
        parts.append(f"망 요건: {c['network_req']}")
    if c.get("cost_req"):
        parts.append(f"비용·권한: {c['cost_req']}")
    if c.get("license"):
        parts.append(f"라이선스: {c['license']}")
    return " · ".join(parts) or "요구 환경 미확인 — 원문·저장소에서 확인 필요"


def build_steps(c):
    env = c.get("runtime_env") or ""
    if env == "브라우저만":
        return "① 링크 접속 → ② 내 업무 데이터로 시험 → ③ 동료와 결과 검증"
    if env == "MCP·CLI 설정":
        return "① 저장소 README의 설치 절차 확인 → ② 개인 PC에서 시험 연결 → ③ 업무망 반입 전 보안성 검토 문의"
    if env == "설치 필요":
        return "① 설치 파일·요구 사양 확인 → ② 개인 환경에서 기능 검증 → ③ 부서 공유 전 관리자 권한 확인"
    if env == "AI 도구 설정":
        return "① 스킬·GEM 파일 확보 → ② 내 AI 도구에 등록 → ③ 실제 업무 문서로 출력 품질 검증"
    return "① 원문·저장소에서 실체 확인 → ② 소규모 업무로 시험 → ③ 결과를 동료와 교차 검증"


def build_cautions(c, ev):
    parts = []
    if c.get("link_ok") is False:
        parts.append("최근 점검에서 대상 URL이 응답하지 않았습니다")
    if c.get("maintenance") in ("정체", "방치"):
        parts.append(f"저장소 유지보수가 {c['maintenance']} 상태입니다")
    if ev and str(ev.get("evidence", "")).startswith("E0"):
        parts.append("게시글 주장 외 독립 증거가 아직 없습니다")
    if ev and ev.get("feedback") == "미확인":
        parts.append("실사용 피드백이 미확인입니다 — 도입 전 소규모 검증을 권합니다")
    parts.append("성과 수치는 출처가 확인된 것만 신뢰하세요")
    return " · ".join(parts)


def eval_table(ev):
    if not ev:
        return "<p>평가 데이터 없음</p>"
    rows = [("AX 단계", ev.get("ax")), ("업무 범위", f"{ev.get('s')} {ev.get('s_name', '')}"),
            ("업무 완결성", f"{ev.get('c')} {ev.get('c_name', '')}"), ("권한(P축)", ev.get("p")),
            ("위험도", ev.get("risk")), ("인간 통제", ev.get("human")),
            ("증거 등급", ev.get("evidence")), ("신뢰도", ev.get("confidence"))]
    cells = "".join(f"<tr><th scope=\"row\">{esc(k)}</th><td>{esc(v)}</td></tr>"
                    for k, v in rows if v)
    return f'<div class="table-wrap"><table class="obs-table">{cells}</table></div>'


def main():
    cases = json.load(open("data/cases.json"))["cases"]
    evals = {e["id"]: e for e in json.load(open("site/data/evaluations.json"))["cases"]}
    OUT_DIR.mkdir(exist_ok=True)
    for c in cases:
        ev = evals.get(c["id"])
        related = [x for x in cases
                   if x["id"] != c["id"] and x.get("task_category") == c.get("task_category")][:3]
        rel_html = "".join(
            f'<li><a href="{esc(r["id"])}.html">{esc(r["title"])}</a></li>' for r in related
        ) or "<li>같은 분류의 다른 사례가 아직 없습니다</li>"
        links = []
        if c.get("case_url"):
            links.append(f'<a href="{esc(c["case_url"])}" target="_blank" rel="noopener">사례 대상 바로가기</a>')
        if c.get("link"):
            label = "원문 게시물" if "threads.com" in c["link"] else "공유 링크"
            links.append(f'<a href="{esc(c["link"])}" target="_blank" rel="noopener">{label}</a>')
        links.append(f'<a href="../?case={esc(c["id"])}">아카이브에서 보기</a>')
        page = TEMPLATE.format(
            base=BASE, cid=esc(c["id"]), title=esc(c["title"]),
            desc=esc(c["summary"][:150]), org=esc(c["org"]), org_type=esc(c["org_type"]),
            region=f" · {esc(c['region'])}" if c.get("region") else "",
            task=esc(c.get("task_category") or "분류 없음"), date=esc(c["date"]),
            summary=esc(c["summary"]), links=" · ".join(links),
            eval_table=eval_table(ev),
            rationale=esc((ev or {}).get("rationale") or ""),
            needs=esc(build_needs(c)), steps=esc(build_steps(c)),
            cautions=esc(build_cautions(c, ev)), related=rel_html)
        (OUT_DIR / f"{c['id']}.html").write_text(page, encoding="utf-8")
    # 고아 페이지 제거 (사례 삭제·병합 대비)
    valid = {f"{c['id']}.html" for c in cases}
    removed = 0
    for f in OUT_DIR.glob("*.html"):
        if f.name not in valid:
            f.unlink()
            removed += 1
    print(f"site/case/ ← {len(cases)}건 생성" + (f", 고아 {removed}건 제거" if removed else ""))


if __name__ == "__main__":
    main()
