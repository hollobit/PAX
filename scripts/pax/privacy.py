"""공개 전 익명화 검사. 요약·제목에 개인정보/원문 흔적이 있으면 문제 목록을 반환한다."""
import re

MAX_SUMMARY_LEN = 300

_PHONE_RE = re.compile(r"01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_NICKNAME_RE = re.compile(r"\S{2,10}님\s*:")          # "홍길동님:" 채팅 붙여넣기
_KAKAO_EXPORT_RE = re.compile(r"^\[[^\]]{1,20}\]\s*\[", re.MULTILINE)  # "[닉네임] [오후 2:31]"
# 직선 홑따옴표(')는 한국어 제목에 흔히 쓰여 허용한다. 곡선/일본식 인용부호와
# ASCII 쌍따옴표(")는 원문 직접 인용 흔적으로 보고 계속 차단한다.
_QUOTE_CHARS = ("“", "”", "「", "」", '"')


def find_privacy_issues(case: dict) -> list[str]:
    issues = []
    tags_text = " ".join(case.get("tags", []) or [])
    text = "\n".join([
        case.get("title", ""), case.get("summary", ""),
        case.get("org", ""), tags_text,
    ])

    if _PHONE_RE.search(text):
        issues.append("전화번호 패턴이 포함되어 있습니다")
    if _EMAIL_RE.search(text):
        issues.append("이메일 주소가 포함되어 있습니다")
    if _NICKNAME_RE.search(text) or _KAKAO_EXPORT_RE.search(text):
        issues.append("채팅 닉네임 패턴이 포함되어 있습니다")
    if any(ch in text for ch in _QUOTE_CHARS):
        issues.append("직접 인용 부호가 포함되어 있습니다 (요약으로 재작성 필요)")
    if len(case.get("summary", "")) > MAX_SUMMARY_LEN:
        issues.append(f"summary 길이 초과 (최대 {MAX_SUMMARY_LEN}자)")

    return issues
