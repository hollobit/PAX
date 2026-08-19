"""후보 사례를 검증·중복 제거 후 data/cases.json에 append-only로 병합한다.

사용법: python3 -m pax.merge <incoming.json>   (repo 루트에서 실행)
incoming 형식: 사례 dict 리스트. 각 dict는 `id` 대신 `raw_text`(해시용 원문)를 가진다.
"""
import datetime
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

from pax.privacy import find_privacy_issues
from pax.schema import OPTIONAL_FIELDS, REQUIRED_FIELDS, validate_case

CASES_PATH = Path("data/cases.json")
REJECTED_DIR = Path("data/rejected")
_CANDIDATE_FIELDS = (REQUIRED_FIELDS - {"id"}) | OPTIONAL_FIELDS


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).strip()


def make_id(source: str, raw_text: str) -> str:
    digest = hashlib.sha256(f"{source}:{normalize_text(raw_text)}".encode())
    return digest.hexdigest()[:16]


def prepare_candidate(cand: dict) -> dict:
    """스키마 화이트리스트에 있는 필드만 통과시킨다 — 그 외 필드(예: 닉네임, 원문 조각)는
    공개 저장소로 절대 전달되지 않는다."""
    prepared = {k: cand[k] for k in _CANDIDATE_FIELDS if k in cand}
    prepared["id"] = make_id(cand.get("source", ""), cand.get("raw_text", ""))
    return prepared


def normalize_url(url) -> str | None:
    """중복 판정용 URL 정규화 — 스킴·호스트 소문자화, 프래그먼트·끝 슬래시 제거.

    쿼리 스트링은 보존한다(서비스가 쿼리로 구분될 수 있음 — 과잉 중복 판정 방지).
    """
    if not url or not isinstance(url, str):
        return None
    m = re.match(r"(https?)://([^/?#]+)([^#]*)", url.strip())
    if not m:
        return None
    scheme, host, rest = m.group(1).lower(), m.group(2).lower(), m.group(3)
    return f"{scheme}://{host}{rest.rstrip('/')}"


def case_urls(case: dict):
    """중복 판정에 쓰는 사례의 URL 집합 — link와 case_url을 구분 없이 본다."""
    return {u for u in (normalize_url(case.get("link")),
                        normalize_url(case.get("case_url"))) if u}


def merge_cases(existing_doc: dict, candidates: list[dict],
                updated_at: str) -> tuple[dict, list[dict]]:
    seen_ids = {c["id"] for c in existing_doc["cases"]}
    # link ↔ case_url 교차 중복 검사: 같은 결과물이 한쪽 사례에서는 link에,
    # 다른 쪽에서는 case_url에 실려도 잡아낸다 (2026-08-19 중복 사례의 재발 방지).
    seen_urls = set()
    for c in existing_doc["cases"]:
        seen_urls |= case_urls(c)
    accepted, rejected = [], []
    for cand in candidates:
        prepared = prepare_candidate(cand)
        errors = validate_case(prepared) + find_privacy_issues(prepared)
        if errors:
            rejected.append({"case": cand, "errors": errors})
            continue
        if prepared["id"] in seen_ids:
            continue
        dup_urls = case_urls(prepared) & seen_urls
        if dup_urls:
            print(f"중복 URL 제외: {prepared.get('title', '?')[:40]} ← {sorted(dup_urls)[0]}")
            continue
        seen_ids.add(prepared["id"])
        seen_urls |= case_urls(prepared)
        accepted.append(prepared)
    new_doc = {"updated_at": updated_at,
               "cases": [*existing_doc["cases"], *accepted]}
    return new_doc, rejected


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: python3 -m pax.merge <incoming.json>", file=sys.stderr)
        return 2
    incoming_path = Path(sys.argv[1])

    try:
        candidates = json.loads(incoming_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"오류: 후보 파일을 찾을 수 없습니다: {incoming_path}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"오류: 후보 파일 JSON 파싱 실패: {e.msg} (줄 {e.lineno}, 열 {e.colno})", file=sys.stderr)
        return 1

    try:
        existing_doc = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"오류: {CASES_PATH}가 없습니다. 먼저 초기화해주세요", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"오류: {CASES_PATH} JSON 파싱 실패: {e.msg} (줄 {e.lineno}, 열 {e.colno})", file=sys.stderr)
        return 1

    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    new_doc, rejected = merge_cases(existing_doc, candidates, now.isoformat(timespec="seconds"))

    CASES_PATH.write_text(
        json.dumps(new_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if rejected:
        REJECTED_DIR.mkdir(parents=True, exist_ok=True)
        out = REJECTED_DIR / incoming_path.name
        out.write_text(json.dumps(rejected, ensure_ascii=False, indent=2),
                       encoding="utf-8")
        print(f"거부 {len(rejected)}건 → {out}")
    added = len(new_doc["cases"]) - len(existing_doc["cases"])
    print(f"신규 {added}건 병합, 총 {len(new_doc['cases'])}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
