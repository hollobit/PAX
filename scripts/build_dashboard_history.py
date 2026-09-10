#!/usr/bin/env python3
"""현황판 지표의 일자별 원장을 site/data/dashboard-history.json으로 낸다.

현황판은 지금까지 '현재 값'만 보여 줬다. 증감을 적으려면 어제 값이 있어야 하는데
저장소에 그 이력이 없었다. 그래서 두 갈래로 채운다.

- **복원**: 사례 원장에서 되살릴 수 있는 지표(사례 수·MCP·모델 채택률·저장소 수·라이선스)는
  `collected_at`을 기준으로 그날까지 등재된 사례만 모아 다시 계산한다.
- **관측**: 되살릴 수 없는 지표(챔피언 수·저장소 스타)는 오늘부터 실측을 적는다.
  스타는 계속 오르내리고 챔피언은 비공개 프로필에서 나오므로 과거를 지어낼 수 없다.

복원값의 한계를 분명히 해 둔다 — **지금 원장으로 되돌아본 값**이라, 그날 화면에 떠 있던
숫자와 다를 수 있다. 나중에 지운 중복이나 고친 분류가 과거 날짜에도 소급되기 때문이다.
그래서 항목마다 `source`를 남겨 복원인지 관측인지 구분한다.
"""
from __future__ import annotations

import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = os.path.join(ROOT, "data", "cases.json")
COMMUNITY = os.path.join(ROOT, "data", "community_stats.json")
CHAMPIONS = os.path.join(ROOT, "site", "data", "champions.json")
INDEX = os.path.join(ROOT, "site", "data", "index.json")
OUT = os.path.join(ROOT, "site", "data", "dashboard-history.json")

# build_index.py와 같은 정의를 쓴다 — 분모가 어긋나면 증감이 거짓말을 한다.
LLM_DEPS = {"국산 독자모델", "국산 오픈웨이트", "해외 상용 API", "해외 오픈웨이트(로컬)", "혼합"}
DOMESTIC = {"국산 독자모델", "국산 오픈웨이트"}
LOCAL = {"국산 오픈웨이트", "해외 오픈웨이트(로컬)"}


def urls(c: dict) -> list[str]:
    return [c.get(k) or "" for k in ("link", "case_url", "mirror_url")]


def is_mcp(c: dict) -> bool:
    return "MCP" in c.get("title", "") or "MCP" in " ".join(c.get("tags", []))


def measure(cases: list) -> dict:
    """그날까지 등재된 사례로 계산할 수 있는 것만 낸다."""
    n = len(cases)
    mcp = sum(1 for c in cases if is_mcp(c))
    deps = [c.get("model_dependency") for c in cases]
    known = sum(1 for d in deps if d in LLM_DEPS)
    gitlab = [c for c in cases if any("gitlab.aigov" in u for u in urls(c))]
    github = [c for c in cases if any("github.com" in u for u in urls(c))]
    gl_none = sum(1 for c in gitlab if c.get("license") in (None, "명시 없음"))
    return {
        "total_cases": n,
        "mcp_cases": mcp,
        "mcp_rate": round(mcp / n, 4) if n else None,
        "domestic_model_rate": round(sum(1 for d in deps if d in DOMESTIC) / known, 4) if known else None,
        "local_model_rate": round(sum(1 for d in deps if d in LOCAL) / known, 4) if known else None,
        "gitlab_cases": len(gitlab),
        "github_cases": len(github),
        "gitlab_license_none_rate": round(gl_none / len(gitlab), 4) if gitlab else None,
    }


def main() -> int:
    cases = json.load(open(CASES, encoding="utf-8"))["cases"]
    today = datetime.date.today().isoformat()

    dates = sorted({c.get("collected_at") for c in cases if c.get("collected_at")})
    days: dict[str, dict] = {}
    for d in dates:
        upto = [c for c in cases if (c.get("collected_at") or "") <= d]
        days[d] = {**measure(upto), "source": "복원"}

    # 가입자는 community_stats에 실제 일자별 원장이 있다 — 복원이 아니라 관측이다.
    try:
        members = json.load(open(COMMUNITY, encoding="utf-8")).get("members", {})
    except Exception:
        members = {}
    for d, v in members.items():
        days.setdefault(d, {"source": "관측"})["members"] = v

    # 오늘 값은 실측으로 덮는다(복원으로 알 수 없는 것까지 함께 적는다).
    today_row = days.setdefault(today, {})
    today_row.update(measure([c for c in cases if (c.get("collected_at") or "") <= today]))
    today_row["source"] = "관측"
    try:
        today_row["total_champions"] = json.load(open(CHAMPIONS, encoding="utf-8")).get("total")
    except Exception:
        pass
    try:
        idx = json.load(open(INDEX, encoding="utf-8"))
        for k in ("gitlab_stars_total", "github_stars_total"):
            if idx.get(k) is not None:
                today_row[k] = idx[k]
    except Exception:
        pass

    # 이전 회차에 적어 둔 관측값(챔피언·스타)은 되살릴 수 없으므로 반드시 보존한다.
    try:
        old = json.load(open(OUT, encoding="utf-8")).get("days", {})
    except Exception:
        old = {}
    for d, row in old.items():
        keep = {k: v for k, v in row.items()
                if k in ("total_champions", "gitlab_stars_total", "github_stars_total", "members")}
        if not keep:
            continue
        days.setdefault(d, {"source": row.get("source", "관측")}).update(
            {k: v for k, v in keep.items() if k not in days.get(d, {})})

    payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": ("복원 = 지금 원장으로 되돌아본 값이라 그날 화면의 숫자와 다를 수 있다"
                 "(나중에 지운 중복·고친 분류가 소급된다). 관측 = 그날 적어 둔 실측값."),
        "days": {d: days[d] for d in sorted(days)},
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")
    obs = sum(1 for r in days.values() if r.get("source") == "관측")
    print(f"site/data/dashboard-history.json ← {len(days)}일치 (관측 {obs}일 · 복원 {len(days) - obs}일)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
