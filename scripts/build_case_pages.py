#!/usr/bin/env python3
"""사례별 정적 상세 페이지 생성 (로드맵 2-8).

site/case/<id>.html — og 태그를 갖춘 고정 페이지. "결재에 이 URL 하나만 붙이면 되는"
공유 단위이며, JS 미실행 크롤러·AI 에이전트도 본문을 읽을 수 있다(0-5의 완성).

사용: python3 scripts/build_case_pages.py  (매 병합 후 실행 — 전량 재생성, 수 초)
"""
import html
from pathlib import Path
from pax.case_details import detail_list, rank_entry
from pax.case_developer import developer_section
from pax.jsonio import load_json, read_json, write_json
from pax.urls import preferred_url
from stamp_assets import digest, stamp_file
from sync_nav import render_external, render_nav

BASE = "https://hollobit.github.io/PAX"


def safe_href(url):
    """사례 주소를 링크로 쓸 때 https만 허용한다 — 병합은 스키마가 막지만 손으로 보강하는 경로에는
    검사가 없어, javascript: 같은 주소가 들어오면 공개 페이지에서 실행될 수 있다."""
    return url if isinstance(url, str) and url.startswith("https://") else None
OUT_DIR = Path("site/case")
RANK = Path("site/data/case-rank.json")
PAGE_JS = Path("site/case-page.js")
THUMBS = Path("site/thumbs")
THUMB_W, THUMB_H = 640, 400  # make_thumbs가 만드는 크기 — 자리를 미리 잡아 화면이 밀리지 않게


def thumb_parts(c, target, title):
    """(og:image 태그, 본문 썸네일) — 썸네일이 없으면 둘 다 빈 문자열.
    ?v=는 파일 mtime(publish의 thumb_v와 같은 값)이라 썸네일을 다시 찍으면 캐시가 풀린다."""
    jpg = THUMBS / f"{c['id']}.jpg"
    if not jpg.exists():
        return "", ""
    v = int(jpg.stat().st_mtime)
    cid = esc(c["id"])
    og = f'\n  <meta property="og:image" content="{BASE}/thumbs/{cid}.jpg?v={v}">'
    img = (f'<img src="../thumbs/{cid}.jpg?v={v}" alt="{title} 화면" width="{THUMB_W}" '
           f'height="{THUMB_H}" loading="eager" decoding="async">')
    if (THUMBS / f"{c['id']}.webp").exists():
        img = f'<picture><source type="image/webp" srcset="../thumbs/{cid}.webp?v={v}">{img}</picture>'
    if target:
        img = (f'<a class="case-page__thumb" href="{esc(target)}" target="_blank" rel="noopener" '
               f'title="사례 대상 바로가기 (새 창)">{img}</a>')
    else:
        img = f'<div class="case-page__thumb">{img}</div>'
    return og, f"\n      {img}"

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
  <meta property="og:site_name" content="모두의 공공AX 사례 아카이브">{og_image}
  <link rel="stylesheet" href="../style.css?v={css_v}">
</head>
<body>
  <header class="site-header">
    <p class="eyebrow">PUBLIC SECTOR AX CASE · 사례 {cid}</p>
    <h1>{title}</h1>
{nav}
{external}
  </header>
  <main class="case-page">
    <section class="obs-section case-page__intro">{thumb}
      <div class="case-page__live" id="case-live" data-case-id="{cid}" data-collected-at="{collected}"></div>
      <p class="case-page__meta">{org} · {org_type}{region} · {task} · {date} 게시</p>
      <p class="case-page__summary">{summary}</p>
      <p class="case-page__links">{links}</p>
    </section>
    <section class="obs-section">
      <h2 class="obs-heading">상세 정보</h2>
      {details}
    </section>{developer}
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
  </main>{page_js}
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
    cases = read_json("data/cases.json")["cases"]
    mcp_reviews = {r["case_id"]: r
                   for r in load_json("site/data/mcp-review.json", default={}).get("reviews", [])}
    evals = {e["id"]: e for e in read_json("site/data/evaluations.json")["cases"]}
    OUT_DIR.mkdir(exist_ok=True)
    # 메뉴는 sync_nav의 목록을 그대로 쓴다(한 단계 아래라 '../'), 스타일은 콘텐츠 해시로 캐시를 무효화한다
    nav, external = render_nav("case", "    ", "../"), render_external("    ")
    css_v = digest(Path("site/style.css"))
    # 인기·신규·북마크는 브라우저에서 그린다 — 스크립트가 없으면(테스트 등) 정적 내용만 낸다
    # 상세 페이지는 stamp_assets 단계보다 먼저 만들어지므로, 스크립트의 import 스탬프를 여기서 먼저 굳힌다
    if PAGE_JS.exists():
        stamp_file(PAGE_JS, {})
    page_js = (f'\n  <script type="module" src="../case-page.js?v={digest(PAGE_JS)}"></script>'
               if PAGE_JS.exists() else "")
    champions = load_json("site/data/champions.json", default={}).get("champions", [])
    titles = {c["id"]: c["title"] for c in cases}
    write_json(RANK, {"cases": [rank_entry(c) for c in cases]}, compact=True)
    for c in cases:
        ev = evals.get(c["id"])
        related = [x for x in cases
                   if x["id"] != c["id"] and x.get("task_category") == c.get("task_category")][:3]
        rel_html = "".join(
            f'<li><a href="{esc(r["id"])}.html">{esc(r["title"])}</a></li>' for r in related
        ) or "<li>같은 분류의 다른 사례가 아직 없습니다</li>"
        links = []
        target = safe_href(preferred_url(c))
        if target:
            links.append(f'<a href="{esc(target)}" target="_blank" rel="noopener">사례 대상 바로가기</a>')
        if safe_href(c.get("link")):
            label = "원문 게시물" if "threads.com" in c["link"] else "공유 링크"
            links.append(f'<a href="{esc(c["link"])}" target="_blank" rel="noopener">{label}</a>')
        if safe_href(c.get("mirror_url")):
            mlabel = "공공 깃랩 미러" if "gitlab.aigov" in c["mirror_url"] else "미러 저장소"
            links.append(f'<a href="{esc(c["mirror_url"])}" target="_blank" rel="noopener">{mlabel}</a>')
        og_image, thumb = thumb_parts(c, target, esc(c["title"]))
        links.append(f'<a href="../?case={esc(c["id"])}">아카이브에서 보기</a>')
        review = mcp_reviews.get(c["id"])
        if review:
            links.append(
                f'<a href="../mcp-review.html">MCP 검증: {esc(review["overall"])}'
                f' ({esc(review.get("checked_at") or "")})</a>')
        page = TEMPLATE.format(
            og_image=og_image, thumb=thumb, page_js=page_js, collected=esc(c.get("collected_at")),
            details=detail_list(c), developer=developer_section(c["id"], champions, titles), nav=nav, external=external, css_v=css_v, base=BASE, cid=esc(c["id"]), title=esc(c["title"]),
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
