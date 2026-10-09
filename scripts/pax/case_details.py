"""사례 상세 페이지(site/case/<id>.html)의 '상세 정보' 표와 인기 판정용 순위 파일 항목.

상세 정보는 원장에 값이 있는 항목만 줄을 만든다(미확인 항목을 '없음'처럼 보이게 하지 않는다).
인기·신규·북마크 수는 시간과 전체 사용자 북마크에 따라 바뀌므로 정적 HTML에 굽지 않고
페이지의 case-page.js가 그린다 — 그 판정에 필요한 최소 필드만 case-rank.json으로 내보낸다.
"""
from __future__ import annotations

import html
from urllib.parse import quote

SOURCE_LABEL = {"threads": "Threads", "kakao": "오픈채팅"}
ADOPTION_LABELS = (("adoption_budget", "도입 예산"), ("adoption_period", "도입 기간"),
                   ("adoption_procurement", "조달 방식"), ("adoption_security_review", "보안성 검토"),
                   ("adoption_pia", "개인정보 영향평가"))
RANK_FIELDS = ("id", "date", "collected_at", "popularity")


def esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


def rank_entry(c: dict) -> dict:
    """인기 판정 입력(누적 북마크와 함께 쓰는 SNS 반응·게시일·수집일)만 담는다."""
    return {k: c[k] for k in RANK_FIELDS if c.get(k) is not None}


def _model(c: dict) -> str | None:
    dep, models = c.get("model_dependency"), c.get("models_used") or []
    if not dep and not models:
        return None
    return " — ".join(p for p in (esc(dep), esc(", ".join(models))) if p)


def _repo(c: dict) -> str | None:
    parts = []
    if c.get("stars"):
        parts.append(f"★ {int(c['stars']):,}")
    if c.get("maintenance"):
        parts.append(f"유지보수 {esc(c['maintenance'])}")
    return " · ".join(parts) or None


def _health(c: dict) -> str | None:
    if c.get("link_ok") is None:
        return None
    state = "정상" if c["link_ok"] else "응답 없음"
    return f"{state} ({esc(c['health_checked'])})" if c.get("health_checked") else state


def _license(c: dict) -> str | None:
    if not c.get("license"):
        return None
    lic = esc(c["license"])
    return f"{lic} (확인 {esc(c['license_checked'])})" if c.get("license_checked") else lic


def _tags(c: dict) -> str | None:
    tags = c.get("tags") or []
    return " ".join(f'<a href="../?tag={quote(t, safe="")}">#{esc(t)}</a>' for t in tags) or None


def detail_rows(c: dict) -> list[tuple[str, str]]:
    """(항목, 이미 이스케이프된 HTML 값) — 값이 있는 것만."""
    rows = [
        ("사례 성격", esc(c.get("case_class")) or None),
        ("출처 채널", esc(SOURCE_LABEL.get(c.get("source"), c.get("source"))) or None),
        ("수집일", esc(c.get("collected_at")) or None),
        ("태그", _tags(c)),
        ("실행 환경", esc(c.get("runtime_env")) or None),
        ("망 요건", esc(c.get("network_req")) or None),
        ("배포 환경", esc(c.get("deployment_env")) or None),
        ("AI 모델", _model(c)),
        ("라이선스", _license(c)),
        ("저장소", _repo(c)),
        ("링크 점검", _health(c)),
        ("커뮤니티 반응", f"{int(c['popularity']):,}" if c.get("popularity") else None),
    ]
    rows += [(label, esc(c[key])) for key, label in ADOPTION_LABELS if c.get(key)]
    return [(k, v) for k, v in rows if v]


def detail_list(c: dict) -> str:
    rows = detail_rows(c)
    if not rows:
        return '<p class="obs-note">추가로 확인된 정보가 없습니다.</p>'
    items = "".join(f"<dt>{esc(k)}</dt><dd>{v}</dd>" for k, v in rows)
    return f'<dl class="case-page__details">{items}</dl>'
