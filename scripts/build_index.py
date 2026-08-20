#!/usr/bin/env python3
"""공공 AX 지수 산출 (로드맵 2-2·2-7).

cases.json + evaluations.json에서 국가 단위 관측 지표를 계산해
site/data/index.json에 쓰고, --snapshot 시 snapshots/<분기>.json으로 버전을 고정한다.

지표 원칙: 정부가 자기 자료로 만들 수 없는 숫자를, 일관된 척도로 반복 산출한다.
표본 한계(자기선택)는 지표에도 상속된다 — 소비 측에서 항상 함께 표기할 것.
"""
import datetime
import json
import sys
from collections import Counter
from pathlib import Path

OUT = Path("site/data/index.json")
SNAP_DIR = Path("snapshots")


def c_score(c_grade: str) -> int | None:
    if not c_grade or not c_grade.startswith("C"):
        return None
    try:
        return int(c_grade[1])
    except ValueError:
        return None


def build() -> dict:
    cases = json.load(open("data/cases.json"))["cases"]
    evals = json.load(open("site/data/evaluations.json"))["cases"]
    ev_by_id = {e["id"]: e for e in evals}

    ax_dist = Counter(e["ax"] for e in evals if e.get("ax"))
    c_scores = [s for e in evals if (s := c_score(e.get("c"))) is not None]
    p_dist = Counter((e.get("p") or "미확인").split(" ")[0] for e in evals)

    model_dist = Counter(c.get("model_dependency") or "미확인" for c in cases)
    known_model = sum(n for k, n in model_dist.items() if k != "미확인")
    domestic = model_dist.get("국산 독자모델", 0) + model_dist.get("국산 오픈웨이트", 0)
    local = model_dist.get("해외 오픈웨이트(로컬)", 0)

    lic = sum(1 for c in cases if c.get("license"))
    lic_stated = sum(1 for c in cases if c.get("license") and c["license"] != "명시 없음")

    # 공공 깃랩 브릿지 (2-7): 미러 쌍과 개방율
    def urls(c):
        return [u for u in (c.get("link"), c.get("case_url")) if u]
    gitlab_cases = [c for c in cases if any("gitlab.aigov" in u for u in urls(c))]
    mirror_pairs = [c for c in gitlab_cases
                    if any("github.com" in u for u in urls(c))]

    mcp_cases = [c for c in cases if "MCP" in c["title"] or "MCP" in " ".join(c["tags"])]
    transition = Counter(c.get("transition_stage") or "미확인" for c in cases)

    unknown_gate = sum(1 for e in evals if e.get("approval_gate") == "미확인")
    unknown_feedback = sum(1 for e in evals if e.get("feedback") == "미확인")

    return {
        "generated_at": datetime.date.today().isoformat(),
        "quarter": f"{datetime.date.today().year}Q{(datetime.date.today().month - 1) // 3 + 1}",
        "sample_note": "오픈채팅·Threads 자기선택 표본 — 전국 공공부문을 대표하지 않음",
        "total_cases": len(cases),
        "ax_distribution": dict(ax_dist),
        "c_axis_mean": round(sum(c_scores) / len(c_scores), 2) if c_scores else None,
        "p_distribution": dict(p_dist),
        "model_dependency": dict(model_dist),
        "domestic_model_rate": round(domestic / known_model, 3) if known_model else None,
        "local_model_rate": round(local / known_model, 3) if known_model else None,
        "model_known": known_model,
        "license_tagged": lic,
        "license_stated_rate": round(lic_stated / lic, 3) if lic else None,
        "gitlab_cases": len(gitlab_cases),
        "gitlab_mirror_pairs": len(mirror_pairs),
        "gitlab_open_rate": round(len(mirror_pairs) / len(gitlab_cases), 3) if gitlab_cases else None,
        "mcp_cases": len(mcp_cases),
        "transition_funnel": dict(transition),
        "unknown_rates": {
            "approval_gate": round(unknown_gate / len(evals), 3),
            "feedback": round(unknown_feedback / len(evals), 3),
        },
        "mirror_pair_cases": [
            {"id": c["id"], "title": c["title"],
             "github": next(u for u in urls(c) if "github.com" in u),
             "gitlab": next(u for u in urls(c) if "gitlab.aigov" in u)}
            for c in mirror_pairs
        ],
    }


def main():
    doc = build()
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} ← 지수 갱신 ({doc['quarter']})")
    if "--snapshot" in sys.argv:
        SNAP_DIR.mkdir(exist_ok=True)
        snap = SNAP_DIR / f"{doc['quarter']}.json"
        snap.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{snap} ← 분기 스냅샷 고정")


if __name__ == "__main__":
    main()
