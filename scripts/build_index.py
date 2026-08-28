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
    champ_doc = json.load(open("site/data/champions.json"))
    champ_of_case = {}
    for ch in champ_doc.get("champions", []):
        for cid in ch.get("cases", []):
            champ_of_case.setdefault(cid, []).append(ch["name"])
    ev_by_id = {e["id"]: e for e in evals}

    ax_dist = Counter(e["ax"] for e in evals if e.get("ax"))
    c_scores = [s for e in evals if (s := c_score(e.get("c"))) is not None]
    p_dist = Counter((e.get("p") or "미확인").split(" ")[0] for e in evals)

    model_dist = Counter(c.get("model_dependency") or "미확인" for c in cases)
    llm_deps = {"국산 독자모델", "국산 오픈웨이트", "해외 상용 API", "해외 오픈웨이트(로컬)", "혼합"}
    known_model = sum(v for k, v in model_dist.items() if k in llm_deps)  # 채택률 분모 = LLM 런타임 보유 사례
    domestic = model_dist.get("국산 독자모델", 0) + model_dist.get("국산 오픈웨이트", 0)
    local = model_dist.get("해외 오픈웨이트(로컬)", 0)

    lic = sum(1 for c in cases if c.get("license"))
    lic_stated = sum(1 for c in cases if c.get("license") and c["license"] != "명시 없음")

    # 공공 깃랩 브릿지 (2-7): 미러 쌍과 개방율
    def urls(c):
        return [u for u in (c.get("link"), c.get("case_url"), c.get("mirror_url")) if u]
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
        "total_champions": champ_doc.get("total", 0),
        "community": (lambda c: {
            "members": c.get("members", {}).get("latest"),
            "kakao_week": c.get("kakao", {}).get("week"),
            "kakao_total_observed": c.get("kakao", {}).get("total"),
            "threads_observed": c.get("threads", {}).get("observed_total"),
        })(json.load(open("site/data/community.json"))
           if Path("site/data/community.json").exists() else {}),
        "certified_champions": sum(
            1 for ch in champ_doc.get("champions", []) if ch.get("certification")),
        "unattributed_cases": len(champ_doc.get("unattributed", [])),
        "ax_distribution": dict(ax_dist),
        "c_axis_mean": round(sum(c_scores) / len(c_scores), 2) if c_scores else None,
        "p_distribution": dict(p_dist),
        "model_dependency": dict(model_dist),
        "model_stats": model_stats(cases),
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
        # 저장소 지표 (관측소 확장): 스타·유지보수 — GitHub/공공 깃랩 분리 집계
        "maintenance_distribution": dict(Counter(
            c.get("maintenance") for c in cases if c.get("maintenance"))),
        "stars_collected": sum(1 for c in cases if c.get("stars") is not None),
        # 플랫폼별 지표 — 미러 사례는 양쪽에 모두 나타나되 각 플랫폼 자기 스타를 쓴다
        "repo_stats": {
            platform: {
                "count": len(plat_cases),
                "starred": sum(1 for c in plat_cases if c.get(star_field) is not None),
                "stars_sum": sum(c.get(star_field) or 0 for c in plat_cases),
                "maintenance": dict(Counter(
                    c.get("maintenance") for c in plat_cases if c.get("maintenance"))),
                "top": [
                    {"id": c["id"], "title": c["title"], "stars": c[star_field],
                     "maintenance": c.get("maintenance"), "license": c.get("license"),
                     # 챔피언 귀속명 우선, 미귀속이면 저장소 계정명
                     "developer": " · ".join(champ_of_case.get(c["id"], [])[:2])
                                  or next((u.split("/")[3] for u in urls(c)
                                           if "github.com" in u or "gitlab.aigov" in u), "미상")}
                    for c in sorted([x for x in plat_cases if x.get(star_field) is not None],
                                    key=lambda x: -x[star_field])[:10]
                ],
            }
            for platform, star_field, plat_cases in (
                ("gitlab", "stars_gitlab",
                 [c for c in cases if any("gitlab.aigov" in u for u in urls(c))]),
                ("github", "stars_github",
                 [c for c in cases if any("github.com" in u for u in urls(c))]),
            )
        },
        # 라이선스 현황
        "license_distribution": dict(Counter(
            c["license"] for c in cases if c.get("license")).most_common()),
        # 라이선스 × 플랫폼 매트릭스 (github-pages는 GitHub로 합산)
        "license_matrix": {
            name: {"github": sum(1 for c in cases if c.get("license") == name
                                 and c.get("license_source") in ("github", "github-pages")),
                   "gitlab": sum(1 for c in cases if c.get("license") == name
                                 and c.get("license_source") == "gitlab")}
            for name in dict(Counter(
                c["license"] for c in cases if c.get("license")).most_common())
        },
        "license_by_source": {
            src: {"total": sum(1 for c in cases if c.get("license_source") == src),
                  "stated": sum(1 for c in cases if c.get("license_source") == src
                                and c["license"] != "명시 없음")}
            for src in ("github", "github-pages", "gitlab")
        },
        # MCP 현황 — 공급/소비·공식/비공식·완결성
        "mcp_stats": {
            "total": len(mcp_cases),
            "official": sum(1 for c in mcp_cases if c.get("mcp_official") is True),
            "unofficial": sum(1 for c in mcp_cases if c.get("mcp_official") is False),
            "roles": dict(Counter(
                (ev_by_id.get(c["id"], {}).get("mcp_role") or "미상") for c in mcp_cases)),
            "c_grades": dict(Counter(
                (ev_by_id.get(c["id"], {}).get("c") or "미상") for c in mcp_cases)),
            "maintenance": dict(Counter(
                c.get("maintenance") for c in mcp_cases if c.get("maintenance"))),
        },
        "mirror_pair_cases": [
            {"id": c["id"], "title": c["title"],
             "github": next(u for u in urls(c) if "github.com" in u),
             "gitlab": next(u for u in urls(c) if "gitlab.aigov" in u)}
            for c in mirror_pairs
        ],
    }


DOMESTIC_MODEL_RE = None  # 아래 함수에서 지연 컴파일


def model_stats(cases: list) -> dict:
    """관측소 모델 현황 섹션용 — 모델 패밀리로 정규화해 집계하고 사례를 연결한다."""
    import re
    dom_re = re.compile(r"HyperCLOVA|하이퍼클로바|CLOVA|HCX|schift|EXAONE|엑사원|Solar|가우스|믿:?음|Kanana|A\.X")
    # 표기 변형을 패밀리로 묶는 정규화 — 순서 중요(구체 패턴 먼저)
    FAMILY_RULES = [
        (re.compile(r"HCX|HyperCLOVA|하이퍼클로바", re.I), "HyperCLOVA X"),
        (re.compile(r"schift", re.I), "schift(자체 학습)"),
        (re.compile(r"Gemma", re.I), "Gemma"),
        (re.compile(r"Gemini|제미나이", re.I), "Gemini"),
        (re.compile(r"GPT|OpenAI", re.I), "GPT(OpenAI)"),
        (re.compile(r"Claude|Codex|Anthropic|상용 코딩 에이전트", re.I), "Claude/Codex(상용 에이전트)"),
        (re.compile(r"Qwen", re.I), "Qwen"),
        (re.compile(r"GLM", re.I), "GLM"),
        (re.compile(r"Whisper", re.I), "Whisper"),
        (re.compile(r"Ollama|vLLM|LiteLLM|LM Studio|WebGPU", re.I), "로컬 서빙(Ollama·vLLM 등)"),
    ]

    def family_of(name: str) -> str:
        for pat, fam in FAMILY_RULES:
            if pat.search(name):
                return fam
        return name  # 미분류는 원문 유지

    fams: dict[str, dict] = {}
    for c in cases:
        seen_fams = set()  # 한 사례가 같은 패밀리를 여러 표기로 써도 1회만 센다
        for m in c.get("models_used") or []:
            fam = family_of(m)
            entry = fams.setdefault(fam, {"name": fam, "n": 0, "variants": set(),
                                          "cases": [], "domestic": bool(dom_re.search(fam))})
            entry["variants"].add(m)
            if fam not in seen_fams:
                entry["n"] += 1
                entry["cases"].append({"id": c["id"], "title": c["title"]})
                seen_fams.add(fam)
    models_top = sorted(fams.values(), key=lambda e: -e["n"])[:20]
    for e in models_top:
        e["variants"] = sorted(e["variants"])
    domestic_cases = [{"id": c["id"], "title": c["title"],
                       "models": c.get("models_used") or []}
                      for c in cases
                      if c.get("model_dependency") in ("국산 독자모델", "국산 오픈웨이트")
                      or any(dom_re.search(m) for m in c.get("models_used") or [])]
    LLM_DEPS = {"국산 독자모델", "국산 오픈웨이트", "해외 상용 API", "해외 오픈웨이트(로컬)", "혼합"}
    dist_detail = {}
    for c in cases:
        dep = c.get("model_dependency")
        if not dep:
            dep = "미확인"
        d = dist_detail.setdefault(dep, {"n": 0, "specified": 0})
        d["n"] += 1
        if c.get("models_used"):
            d["specified"] += 1
    return {"models_top": models_top, "domestic_cases": domestic_cases,
            "dist_detail": dist_detail}


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
