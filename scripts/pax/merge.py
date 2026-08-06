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
from pax.schema import validate_case

CASES_PATH = Path("data/cases.json")
REJECTED_DIR = Path("data/rejected")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).strip()


def make_id(source: str, raw_text: str) -> str:
    digest = hashlib.sha256(f"{source}:{normalize_text(raw_text)}".encode())
    return digest.hexdigest()[:16]


def prepare_candidate(cand: dict) -> dict:
    prepared = {k: v for k, v in cand.items() if k != "raw_text"}
    prepared["id"] = make_id(cand.get("source", ""), cand.get("raw_text", ""))
    return prepared


def merge_cases(existing_doc: dict, candidates: list[dict],
                updated_at: str) -> tuple[dict, list[dict]]:
    seen_ids = {c["id"] for c in existing_doc["cases"]}
    accepted, rejected = [], []
    for cand in candidates:
        prepared = prepare_candidate(cand)
        errors = validate_case(prepared) + find_privacy_issues(prepared)
        if errors:
            rejected.append({"case": cand, "errors": errors})
            continue
        if prepared["id"] in seen_ids:
            continue
        seen_ids.add(prepared["id"])
        accepted.append(prepared)
    new_doc = {"updated_at": updated_at,
               "cases": [*existing_doc["cases"], *accepted]}
    return new_doc, rejected


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: python3 -m pax.merge <incoming.json>", file=sys.stderr)
        return 2
    incoming_path = Path(sys.argv[1])
    candidates = json.loads(incoming_path.read_text(encoding="utf-8"))
    existing_doc = json.loads(CASES_PATH.read_text(encoding="utf-8"))

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
