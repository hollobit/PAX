"""docs/native의 4축 재평가 엑셀을 site/data/evaluations.json으로 변환한다.

사용법: PYTHONPATH=scripts python3 scripts/build_eval_data.py <xlsx 경로>
"""
import json
import sys
from pathlib import Path

import openpyxl

OUT = Path("site/data/evaluations.json")

FIELDS = [
    "no", "id", "org", "title", "ax_prev", "ax", "s", "s_name", "c", "c_name",
    "m", "m_name", "native_scope", "status", "scope", "mcp_role", "risk",
    "human", "evidence", "confidence", "gate", "rationale", "feedback",
    "resilience", "post_url", "service_url",
]


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
        cases.append(case)

    doc = {"evaluated_at": "2026-08-08", "total": len(cases), "cases": cases}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} ← {len(cases)}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
