"""사례 상세 페이지의 '개발자' 구역 — 챔피언 디렉토리(site/data/champions.json)에 귀속된 개발자만.

공개 프로필 기반 정보만 싣는다(이름·소속·계정은 champions.json이 이미 공개 프로필로 한정한 값).
추정 소속에는 '추정', 사례 기준 소속 분류에는 '사례 기준'을 붙여 근거가 다름을 드러낸다.
"""
from __future__ import annotations

from urllib.parse import quote

from pax.case_details import esc

AX_NAME = {1: "AI-Ready", 2: "AI-Enabled", 3: "AI-First", 4: "AI-Native"}
PLATFORM_LABEL = {"github": "GitHub", "gitlab": "공공 GitLab", "threads": "Threads"}
OTHER_LIMIT = 10  # 다른 프로젝트는 최근 것부터 이만큼 — 나머지는 챔피언 카드에서


def makers_of(case_id: str, champions: list) -> list:
    return [ch for ch in champions if case_id in ch.get("cases", [])]


def _https(url) -> str | None:
    return url if isinstance(url, str) and url.startswith("https://") else None


def _profile_line(ch: dict) -> str:
    parts = []
    aff = ch.get("affiliation") or {}
    if aff.get("value"):
        mark = ' <span class="badge badge--inferred">추정</span>' if aff.get("inferred") else ""
        parts.append(f"{esc(aff['value'])}{mark}")
    if ch.get("category"):
        basis = " · 사례 기준" if ch.get("category_basis") == "cases" else ""
        parts.append(f'<span class="champ-card__cat">{esc(ch["category"])}{basis}</span>')
    return " ".join(parts)


def _stats_line(ch: dict) -> str:
    st = ch.get("stats") or {}
    parts = [f"사례 {int(st.get('case_count') or len(ch.get('cases', [])))}건"]
    if AX_NAME.get(st.get("top_ax")):
        parts.append(f"최고 {AX_NAME[st['top_ax']]}")
    if st.get("stars"):
        parts.append(f"반응 {int(st['stars']):,}")
    return " · ".join(parts)


def _cert(ch: dict) -> str:
    cert = ch.get("certification")
    if not cert or not cert.get("tier"):
        return ""
    label = f"✦ AI 챔피언 인증 {esc(cert['tier'])}"
    url = _https(cert.get("source_url"))
    tier = esc(str(cert["tier"]).lower())
    if url:
        return (f' <a class="cert-badge cert-badge--{tier}" href="{esc(url)}" target="_blank" '
                f'rel="noopener">{label}</a>')
    return f' <span class="cert-badge cert-badge--{tier}">{label}</span>'


def _accounts(ch: dict) -> str:
    links = []
    for a in ch.get("accounts") or []:
        url = _https(a.get("url"))
        if url:
            label = f"{PLATFORM_LABEL.get(a.get('platform'), a.get('platform'))} @{a.get('id')}"
            links.append(f'<a href="{esc(url)}" target="_blank" rel="noopener">{esc(label)}</a>')
    return " · ".join(links)


def _others(ch: dict, current_id: str, titles: dict) -> str:
    others = [cid for cid in ch.get("cases", []) if cid != current_id and cid in titles]
    if not others:
        return '<p class="obs-note">아카이브에 등재된 다른 프로젝트가 아직 없습니다.</p>'
    items = "".join(f'<li><a href="{esc(cid)}.html">{esc(titles[cid])}</a></li>'
                    for cid in others[:OTHER_LIMIT])
    more = ""
    if len(others) > OTHER_LIMIT:
        more = (f'<li><a href="../champions.html#champ-{quote(ch["id"], safe="")}">'
                f'외 {len(others) - OTHER_LIMIT}건 — 챔피언 카드에서 모두 보기</a></li>')
    return (f'<p class="case-dev__label">이 개발자의 다른 프로젝트 {len(others)}건</p>'
            f'<ul class="case-page__related">{items}{more}</ul>')


def developer_card(ch: dict, current_id: str, titles: dict) -> str:
    name = f'<a href="../champions.html#champ-{quote(ch["id"], safe="")}">{esc(ch["name"])}</a>'
    rows = [f'<h3 class="case-dev__name">{name}{_cert(ch)}</h3>']
    for line in (_profile_line(ch), _stats_line(ch), _accounts(ch)):
        if line:
            rows.append(f'<p class="case-dev__line">{line}</p>')
    rows.append(_others(ch, current_id, titles))
    return f'<div class="case-dev">{"".join(rows)}</div>'


def developer_section(case_id: str, champions: list, titles: dict) -> str:
    """귀속된 개발자가 없으면 빈 문자열(구역 자체를 만들지 않는다)."""
    makers = makers_of(case_id, champions)
    if not makers:
        return ""
    cards = "".join(developer_card(ch, case_id, titles) for ch in makers)
    return ('\n    <section class="obs-section">\n'
            '      <h2 class="obs-heading" id="developer">개발자</h2>\n'
            f'      {cards}\n'
            '      <p class="obs-note">GitHub·공공 GitLab 공개 프로필 기준 — '
            '<a href="../champions.html">공공AX 챔피언</a> 디렉토리와 같은 자료입니다.</p>\n'
            '    </section>')
