"""docs/native의 4축 재평가 엑셀을 site/data/evaluations.json으로 변환한다.

사용법: PYTHONPATH=scripts python3 scripts/build_eval_data.py <xlsx 경로>
"""
import datetime
import json
import sys
from pathlib import Path

import openpyxl

OUT = Path("site/data/evaluations.json")
# 엑셀 이후 추가된 사례의 평가 — 엑셀 재발행 없이 신규 사례를 반영하는 보충 파일
ADDITIONS = Path("docs/native/eval_additions.json")

FIELDS = [
    "no", "id", "org", "title", "ax_prev", "ax", "s", "s_name", "c", "c_name",
    "m", "m_name", "native_scope", "status", "scope", "mcp_role", "risk",
    "human", "evidence", "confidence", "gate", "rationale", "feedback",
    "resilience", "post_url", "service_url",
]


def derive_tool_type(case: dict) -> str:
    """공개 정보 기반 도구유형 자동 분류 (표시용)."""
    title = case["title"]
    url = str(case.get("service_url") or "")
    if "MCP" in title or (case.get("m") or "").startswith("M"):
        return "MCP 서버·도구"
    if any(k in title for k in ("대시보드", "분석 플랫폼", "현황", "비교", "구조도", "온톨로지", "레이더", "인파", "트랙레코드")):
        return "대시보드·분석"
    if any(k in title for k in ("포털", "플랫폼", "배움터", "허브", "모음", "아카이브", "보드")):
        return "플랫폼·포털"
    if any(k in title for k in ("Chrome", "확장")):
        return "브라우저 확장"
    if any(k in title for k in ("스킬", "플러그인", "에이전트")):
        return "AI 스킬·에이전트"
    if any(k in title for k in ("트레이", "Windows", "데스크톱", "프로그램", "HWP", "엑셀")):
        return "데스크톱 도구"
    if any(k in title for k in ("도입", "발령", "보고", "출범", "개시", "구축")):
        return "도입·정책"
    if url.startswith("https://github.com"):
        return "오픈소스 도구"
    if url:
        return "웹 서비스"
    return "도구·기타"


def derive_p_axis(case: dict) -> str:
    """권한 범위 P축 잠정 판정 (로드맵 2-6) — 공개 서술 기반 기계 판정.

    P0 읽기 전용(조회·검색·시각화) / P1 산출물 생성(문서·코드 — 업무 시스템 밖)
    P2 업무 시스템 쓰기 / P3 처분 보조 / P4 자율 처분.
    서술에 권한 근거가 없으면 보수적으로 낮은 등급 + '(잠정)'을 붙인다.
    """
    title = case["title"].lower()
    text = (case["title"] + " " + str(case.get("rationale") or "")).lower()
    if any(k in text for k in ["결재", "등록", "시스템 반영", "자동 발송", "자동 처리"]):
        return "P2 시스템 쓰기(잠정)"
    if any(k in title for k in ["생성", "작성", "변환", "자동화", "재기안", "초안", "만드는", "빌더",
                                "스킬", "hwpx", "pdf", "슬라이드", "보고서"]):
        return "P1 산출물 생성(잠정)"
    if any(k in title for k in ["조회", "검색", "지도", "대시보드", "현황", "mcp", "분석", "비교",
                                "모음", "포털", "뷰어", "관측"]):
        return "P0 읽기 전용(잠정)"
    return "P1 산출물 생성(잠정)"


def derive_audience(case: dict) -> str:
    """사용자 관계(G2x) 자동 분류 (표시용)."""
    scope = case.get("scope") or ""
    title = case["title"]
    if any(k in title for k in ("대국민", "시민", "민원", "인파", "관광", "국회의원")):
        return "G2C 대국민"
    if any(k in title for k in ("기업", "지원사업", "조달")):
        return "G2B 기업"
    if scope == "Internal":
        return "G2E 공직 내부"
    if scope == "External":
        # 외부 공개지만 공직 실무자·개발자가 주 사용자인 도구가 다수
        if str(case.get("service_url") or "").startswith("https://github.com"):
            return "G2E 공직 실무자"
        return "G2C 공개"
    if scope == "Hybrid":
        return "G2E·G2C 혼합"
    return "미상"


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: python3 scripts/build_eval_data.py <xlsx>", file=sys.stderr)
        return 2
    try:
        wb = openpyxl.load_workbook(sys.argv[1])
        ws = wb["사례별 재평가"]
    except (FileNotFoundError, KeyError) as exc:
        print(f"오류: 평가 시트를 열 수 없습니다 — {exc}", file=sys.stderr)
        return 1

    rows = list(ws.iter_rows(values_only=True))
    cases = []
    for row in rows[1:]:
        if not row[0]:
            continue
        case = dict(zip(FIELDS, [v if v is not None else "" for v in row]))
        case["tool_type"] = derive_tool_type(case)
        case["audience"] = derive_audience(case)
        case["p"] = case.get("p") or derive_p_axis(case)
        cases.append(case)

    if ADDITIONS.exists():
        try:
            additions = json.loads(ADDITIONS.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"오류: 보충 평가 파일 파싱 실패 — {exc}", file=sys.stderr)
            return 1
        existing_ids = {c["id"] for c in cases}
        for raw in additions:
            missing = [f for f in FIELDS if f not in raw]
            if missing:
                print(f"오류: 보충 평가 {raw.get('id', '?')} 필드 누락 — {missing}", file=sys.stderr)
                return 1
            if raw["id"] in existing_ids:
                print(f"경고: 보충 평가 {raw['id']}는 엑셀에 이미 존재 — 건너뜀", file=sys.stderr)
                continue
            case = {f: raw[f] for f in FIELDS}
            case["tool_type"] = derive_tool_type(case)
            case["audience"] = derive_audience(case)
            case["p"] = raw.get("p") or derive_p_axis(case)
            cases.append(case)

    # 안전 프로필 6항목 표준 골격 (로드맵 2-6): 서술이 없으면 '미확인'을 명시한다 —
    # 미확인 비율 자체가 대시보드 KPI가 된다.
    for case in cases:
        case["approval_gate"] = case.get("approval_gate") or "미확인"
        case["audit_log"] = case.get("audit_log") or "미확인"
        case.setdefault("feedback", "미확인")
        case.setdefault("resilience", "미확인")

    # 증거 등급 정규화 (로드맵 0-6): E1의 이중 의미(코드 확인 vs 화면 확인)를
    # 분리한다 — E1은 코드·도구 실체, E2는 화면·서비스 실체. E0 표기도 통일.
    EVIDENCE_NORM = {
        "E1 화면·서비스 확인": "E2 화면·서비스 확인",
        "E0 자기보고": "E0 게시글 주장",
    }
    for case in cases:
        ev = case.get("evidence")
        if ev in EVIDENCE_NORM:
            case["evidence"] = EVIDENCE_NORM[ev]

    # evaluated_at 자동 갱신 (로드맵 0-6): 빌드 시점 = 최종 평가 반영 시점
    today = datetime.date.today().isoformat()
    doc = {"evaluated_at": today, "total": len(cases), "cases": cases}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} ← {len(cases)}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
