#!/usr/bin/env python3
"""MCP 검증 원장 → 공개 산출물(site/data/mcp-review.json).

이 스크립트가 responsible disclosure의 마지막 게이트다:
disclosure 미해결 리뷰의 '심각' 축 note는 어떤 경우에도 고정 문구로 치환된다.
사용: PYTHONPATH=scripts python3 scripts/build_mcp_review.py
"""
import datetime
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pax.mcp_review import load_reviews  # noqa: E402

LEDGER = Path("data/mcp_reviews.json")
OUT = Path("site/data/mcp-review.json")
MASK_NOTE = "비공개 처리 중 — 개발자에게 통보되었습니다"


def compute_overall(axes: dict) -> str:
    verdicts = [a["verdict"] for a in axes.values()]
    if "심각(비공개 처리 중)" in verdicts:
        return "심각(비공개 처리 중)"
    if "주의" in verdicts:
        return "주의"
    if "미검증" in verdicts:
        return "부분 검증"
    if any(v == "통과" for v in verdicts):
        return "양호"
    return "미검증"


def build_public(ledger: dict, case_meta: dict) -> dict:
    reviews, warn_axes = [], Counter()
    for r in ledger.get("reviews", []):
        disclosure = r.get("disclosure")
        unresolved = bool(disclosure) and not disclosure.get("resolved")
        axes = {}
        for name, ax in r.get("axes", {}).items():
            note = ax.get("note", "")
            if unresolved and ax["verdict"] == "심각(비공개 처리 중)":
                note = MASK_NOTE
            axes[name] = {"verdict": ax["verdict"], "note": note}
            if ax["verdict"] == "주의":
                warn_axes[name] += 1
        meta = case_meta.get(r["case_id"], {})
        reviews.append({
            "case_id": r["case_id"],
            "title": meta.get("title", ""),
            "stars": meta.get("stars"),
            "checked_at": r.get("checked_at"),
            "axes": axes,
            "dynamic": r.get("dynamic"),
            "overall": compute_overall(axes),
        })
    counts = Counter(r["overall"] for r in reviews)
    return {
        "generated_at": datetime.date.today().isoformat(),
        "summary": {
            "total": len(reviews),
            "counts": dict(counts),
            "top_warn_axis": warn_axes.most_common(1)[0][0] if warn_axes else None,
        },
        "reviews": sorted(reviews, key=lambda r: (
            ["심각(비공개 처리 중)", "주의", "부분 검증", "양호", "미검증"].index(r["overall"]),
            -(r.get("stars") or 0))),
    }


def main() -> int:
    cases = json.loads(Path("data/cases.json").read_text(encoding="utf-8"))["cases"]
    case_meta = {c["id"]: {"title": c.get("title", ""), "stars": c.get("stars")} for c in cases}
    ledger = load_reviews(LEDGER, set(case_meta))
    # 원장 overall과 재계산 값 불일치 시 실패 — 이중 검증
    for r in ledger.get("reviews", []):
        if r.get("overall") and r["overall"] != compute_overall(r["axes"]):
            print(f"overall 불일치: {r['case_id']} 원장={r['overall']}", file=sys.stderr)
            return 1
    doc = build_public(ledger, case_meta)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    s = doc["summary"]
    print(f"mcp-review.json ← {s['total']}건 (분포 {s['counts']}, 최다 주의 축 {s['top_warn_axis']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
