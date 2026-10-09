"""챔피언 소속 분류 — 공개 프로필 소속 텍스트를 7개 카테고리로 나눈다.

소속 텍스트는 공공 GitLab 표시명·GitHub 소속란에서 온 자유 서술이라 표기가 제각각이다
("대전광역시청", "울산광역시 중구", "병무청 경기북부병무지청"). 규칙은 위에서부터 차례로 본다 —
교육청 소속 학교가 광역지자체로, 광역시 아래 구가 광역지자체로 잘못 들어가지 않게 순서가 중요하다.
소속이 없으면 그 챔피언이 만든 사례의 org_type(schema.ORG_TYPES)으로 정한다.
"""
from __future__ import annotations

import re
from collections import Counter

CATEGORIES = ("중앙행정기관", "광역지자체", "기초지자체", "공공기관", "교육기관",
              "공직(소속 미상)", "민간·커뮤니티")
UNKNOWN_PUBLIC, PRIVATE = "공직(소속 미상)", "민간·커뮤니티"

EDU = re.compile(r"교육청|교육지원청|학교|대학|University|College", re.I)
PUBLIC_BODY = re.compile(r"공사|공단|진흥원|정보원|협력단|연구원|연구소|재단|기준원|ETRI|Research Institute|^코레일", re.I)
METRO_CITY = re.compile(r"(광역시|특별시|특별자치시)$")   # 시로 끝나도 기초가 아닌 것
LOCAL_SUFFIX = re.compile(r"(청|의회)$")
PROVINCE = re.compile(r"(도|광역시|특별시|특별자치시)$|소방본부$|소방서$")
CENTRAL = re.compile(r"(부|처|청|위원회)$|^국립|^국가")

# 사례 org_type → 카테고리(소속이 없을 때). 공직 개인·커뮤니티는 기관을 알려 주지 않으므로 마지막에 본다.
ORG_TYPE_CATEGORY = {"중앙행정기관": "중앙행정기관", "광역지자체": "광역지자체",
                     "기초지자체": "기초지자체", "지방의회": "기초지자체",
                     "공공기관": "공공기관", "교육기관": "교육기관"}


def _tokens(text: str) -> list[str]:
    return re.sub(r"\[[^\]]*\]", " ", text).split()


def _is_local(token: str) -> bool:
    base = LOCAL_SUFFIX.sub("", token)
    return base.endswith(("시", "군", "구")) and not METRO_CITY.search(base) and len(base) >= 2


def classify_affiliation(text: str | None) -> str | None:
    """소속 텍스트 → 카테고리. 비어 있으면 None."""
    text = (text or "").strip()
    if not text:
        return None
    if EDU.search(text):
        return "교육기관"
    if PUBLIC_BODY.search(text):
        return "공공기관"
    tokens = _tokens(text)
    if any(_is_local(t) for t in tokens):
        return "기초지자체"
    if any(PROVINCE.search(LOCAL_SUFFIX.sub("", t)) for t in tokens):
        return "광역지자체"
    if any(CENTRAL.search(t) for t in tokens):
        return "중앙행정기관"
    return PRIVATE


def champion_category(affiliation: dict | None, org_types: list[str]) -> tuple[str, str]:
    """(카테고리, 근거) — 근거는 'affiliation'(공개 프로필 소속) 또는 'cases'(사례 org_type)."""
    by_aff = classify_affiliation((affiliation or {}).get("value"))
    if by_aff:
        return by_aff, "affiliation"
    institutional = Counter(ORG_TYPE_CATEGORY[t] for t in org_types if t in ORG_TYPE_CATEGORY)
    if institutional:
        return institutional.most_common(1)[0][0], "cases"
    if org_types and all(t == "커뮤니티" for t in org_types):
        return PRIVATE, "cases"
    return UNKNOWN_PUBLIC, "cases"
