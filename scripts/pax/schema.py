"""공개 사례(case) 스키마 검증. 오류 메시지 리스트를 반환한다 (빈 리스트 = 유효)."""
import re

REQUIRED_FIELDS = frozenset(
    ["id", "date", "collected_at", "source", "link", "org",
     "org_type", "title", "summary", "tags"]
)
# 선택 필드: case_url — 사례 대상 URL (썸네일·연결용),
#           popularity — 커뮤니티 반응 기반 인기 지표 (좋아요 수 등, 양의 정수),
#           region — 광역시도 (미상이면 null), case_class — 사례 성격 구분,
#           license/license_source/license_checked — 저장소 확인 라이선스 (tag_licenses.py)
OPTIONAL_FIELDS = frozenset(["case_url", "popularity", "region", "case_class",
                             "license", "license_source", "license_checked",
                             "task_category", "runtime_env", "network_req", "cost_req",
                             "link_ok", "health_checked", "maintenance"])
SOURCES = frozenset(["threads", "kakao"])
# 2026-08-19 재정비(로드맵 0-2): '기타' 85% 문제를 해소하는 10분류
ORG_TYPES = frozenset(["중앙행정기관", "광역지자체", "기초지자체", "지방의회",
                       "공공기관", "교육기관", "공직 개인", "커뮤니티",
                       "민간(참고)", "해외(참고)"])
CASE_CLASSES = frozenset(["기관 공식", "개인 개발", "커뮤니티", "참고"])
REGIONS = frozenset(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
                     "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"])
TASK_CATEGORIES = frozenset(["인사·복무", "회계·정산", "계약·조달", "민원", "문서·기안",
                             "감사·법무", "시설·안전", "데이터·통계", "기획·정책", "공통·범용"])

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

    region = case.get("region")
    if region is not None and region not in REGIONS:
        errors.append(f"알 수 없는 region: {region}")

    case_class = case.get("case_class")
    if case_class is not None and case_class not in CASE_CLASSES:
        errors.append(f"알 수 없는 case_class: {case_class}")

    task_category = case.get("task_category")
    if task_category is not None and task_category not in TASK_CATEGORIES:
        errors.append(f"알 수 없는 task_category: {task_category}")

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
