"""공개 사례(case) 스키마 검증. 오류 메시지 리스트를 반환한다 (빈 리스트 = 유효)."""
import re

REQUIRED_FIELDS = frozenset(
    ["id", "date", "collected_at", "source", "link", "org",
     "org_type", "title", "summary", "tags"]
)
# 선택 필드: case_url — 사례 대상 URL (썸네일·연결용),
#           popularity — 커뮤니티 반응 기반 인기 지표 (좋아요 수 등, 양의 정수)
OPTIONAL_FIELDS = frozenset(["case_url", "popularity"])
SOURCES = frozenset(["threads", "kakao"])
ORG_TYPES = frozenset(["중앙부처", "지자체", "공공기관", "교육", "기타"])

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_THREADS_LINK_RE = re.compile(r"^https://www\.threads\.(com|net)/")


def validate_case(case: dict) -> list[str]:
    errors = []
    missing = REQUIRED_FIELDS - case.keys()
    for field in sorted(missing):
        errors.append(f"필수 필드 누락: {field}")
    if missing:
        return errors

    if case["source"] not in SOURCES:
        errors.append(f"알 수 없는 source: {case['source']}")
    elif case["source"] == "kakao":
        # 채팅 원문 링크는 존재하지 않으므로, link는 메시지에서 공유된
        # 공개 서비스/저장소 URL(https)만 허용한다.
        link = case["link"]
        if link is not None and (
                not isinstance(link, str) or not link.startswith("https://")):
            errors.append("kakao 사례의 link는 null 또는 https:// URL이어야 합니다")
    else:  # threads
        if not isinstance(case["link"], str) or not _THREADS_LINK_RE.match(case["link"]):
            errors.append("threads 사례의 link는 threads.com/net URL이어야 합니다")

    for field in ("date", "collected_at"):
        if not isinstance(case[field], str) or not _DATE_RE.match(case[field]):
            errors.append(f"{field}는 YYYY-MM-DD 형식이어야 합니다")

    if case["org_type"] not in ORG_TYPES:
        errors.append(f"알 수 없는 org_type: {case['org_type']}")

    for field in ("org", "title", "summary"):
        if not isinstance(case[field], str) or not case[field].strip():
            errors.append(f"{field}는 비어 있지 않은 문자열이어야 합니다")

    tags = case["tags"]
    if (not isinstance(tags, list) or not tags
            or not all(isinstance(t, str) and t.strip() for t in tags)):
        errors.append("tags는 비어 있지 않은 문자열 리스트여야 합니다")

    if not isinstance(case["id"], str) or not re.match(r"^[0-9a-f]{16}$", case["id"]):
        errors.append("id는 16자리 소문자 16진수여야 합니다")

    case_url = case.get("case_url")
    if case_url is not None and (
            not isinstance(case_url, str) or not case_url.startswith("https://")):
        errors.append("case_url은 null 또는 https:// URL이어야 합니다")

    popularity = case.get("popularity")
    if popularity is not None and (
            not isinstance(popularity, int) or isinstance(popularity, bool)
            or popularity < 1):
        errors.append("popularity는 양의 정수여야 합니다")

    return errors
