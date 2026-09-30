#!/usr/bin/env python3
"""공공 AX 지수 산출 (로드맵 2-2·2-7).

cases.json + evaluations.json에서 국가 단위 관측 지표를 계산해
site/data/index.json에 쓰고, --snapshot 시 snapshots/<분기>.json으로 버전을 고정한다.

지표 원칙: 정부가 자기 자료로 만들 수 없는 숫자를, 일관된 척도로 반복 산출한다.
표본 한계(자기선택)는 지표에도 상속된다 — 소비 측에서 항상 함께 표기할 것.
"""
import sys
from collections import Counter
from pathlib import Path

from pax.jsonio import load_json, read_json, write_json, write_json_if_changed  # noqa: E402
from pax.timeutil import kst_today  # noqa: E402
from pax.urls import case_urls as urls  # noqa: E402

OUT = Path("site/data/index.json")
SNAP_DIR = Path("snapshots")


def c_score(c_grade: str) -> int | None:
    if not c_grade or not c_grade.startswith("C"):
        return None
    try:
        return int(c_grade[1])
    except (ValueError, IndexError):  # 'C'만 적힌 평가가 지수 빌드 전체를 멈추지 않게
        return None


# 모델 채택률 정의 — 관측소 게이지(이 파일)와 증감 배지(build_dashboard_history)가 함께 쓴다
LLM_DEPS = {"국산 독자모델", "국산 오픈웨이트", "해외 상용 API", "해외 오픈웨이트(로컬)", "혼합"}  # 분모
DOMESTIC_DEPS = {"국산 독자모델", "국산 오픈웨이트"}
# '로컬 오픈웨이트 실행' — 공개 가중치를 로컬에서 돌리는 두 분류(관측소 용어 설명과 같다:
# 국산 오픈웨이트 = 국산 공개 가중치 모델 로컬 실행). 지수가 국산 쪽을 빠뜨려 1건 적게 셌던 것을 바로잡았다.
LOCAL_DEPS = {"국산 오픈웨이트", "해외 오픈웨이트(로컬)"}
TOP_REPOS = 10


def is_mcp(c: dict) -> bool:
    return "MCP" in c["title"] or "MCP" in " ".join(c["tags"])


def overview(today, cases: list, champ_doc: dict, community: dict) -> dict:
    return {
        "generated_at": today.isoformat(),
        "quarter": f"{today.year}Q{(today.month - 1) // 3 + 1}",
        "sample_note": "오픈채팅·Threads 자기선택 표본 — 전국 공공부문을 대표하지 않음",
        "total_cases": len(cases),
        "total_champions": champ_doc.get("total", 0),
        "community": {
            "members": community.get("members", {}).get("latest"),
            "kakao_week": community.get("kakao", {}).get("week"),
            "kakao_total_observed": community.get("kakao", {}).get("total"),
            "threads_observed": community.get("threads", {}).get("observed_total"),
        },
        "certified_champions": sum(1 for ch in champ_doc.get("champions", []) if ch.get("certification")),
        "unattributed_cases": len(champ_doc.get("unattributed", [])),
    }


def evaluation_axes(evals: list) -> dict:
    c_scores = [s for e in evals if (s := c_score(e.get("c"))) is not None]
    return {
        "ax_distribution": dict(Counter(e["ax"] for e in evals if e.get("ax"))),
        "c_axis_mean": round(sum(c_scores) / len(c_scores), 2) if c_scores else None,
        "p_distribution": dict(Counter((e.get("p") or "미확인").split(" ")[0] for e in evals)),
    }


def model_rates(cases: list) -> dict:
    """모델 채택률 — 분모는 LLM을 직접 쓰는 사례(비LLM·모델 중립은 뺀다, AGENTS.md §5)."""
    dist = Counter(c.get("model_dependency") or "미확인" for c in cases)
    known = sum(v for k, v in dist.items() if k in LLM_DEPS)
    domestic = sum(dist.get(k, 0) for k in DOMESTIC_DEPS)
    local = sum(dist.get(k, 0) for k in LOCAL_DEPS)
    return {
        "model_dependency": dict(dist),
        "model_stats": model_stats(cases),
        "domestic_model_rate": round(domestic / known, 3) if known else None,
        "local_model_rate": round(local / known, 3) if known else None,
        "model_known": known,
    }


def gitlab_bridge(cases: list) -> tuple[dict, list]:
    """공공 깃랩 브릿지(2-7): 미러 쌍과 개방율. (지표, 미러 쌍 사례)"""
    gitlab_cases = [c for c in cases if any("gitlab.aigov" in u for u in urls(c))]
    pairs = [c for c in gitlab_cases if any("github.com" in u for u in urls(c))]
    return {
        "gitlab_cases": len(gitlab_cases),
        "gitlab_mirror_pairs": len(pairs),
        "gitlab_open_rate": round(len(pairs) / len(gitlab_cases), 3) if gitlab_cases else None,
    }, pairs


def unknown_rates(evals: list) -> dict:
    n = len(evals)
    return {
        "approval_gate": round(sum(1 for e in evals if e.get("approval_gate") == "미확인") / n, 3),
        "feedback": round(sum(1 for e in evals if e.get("feedback") == "미확인") / n, 3),
    }


def platform_repos(cases: list, champ_of_case: dict, star_field: str, host: str) -> dict:
    """플랫폼별 저장소 지표 — 미러 사례는 양쪽에 모두 나타나되 각 플랫폼 자기 스타를 쓴다."""
    plat = [c for c in cases if any(host in u for u in urls(c))]
    starred = [c for c in plat if c.get(star_field) is not None]
    return {
        "count": len(plat),
        "starred": len(starred),
        "stars_sum": sum(c.get(star_field) or 0 for c in plat),
        "maintenance": dict(Counter(c.get("maintenance") for c in plat if c.get("maintenance"))),
        "top": [
            {"id": c["id"], "title": c["title"], "stars": c[star_field],
             "maintenance": c.get("maintenance"), "license": c.get("license"),
             # 챔피언 귀속명 우선, 미귀속이면 저장소 계정명
             "developer": " · ".join(champ_of_case.get(c["id"], [])[:2])
                          or next((u.split("/")[3] for u in urls(c)
                                   if "github.com" in u or "gitlab.aigov" in u), "미상")}
            for c in sorted(starred, key=lambda x: -x[star_field])[:TOP_REPOS]
        ],
    }


def license_details(cases: list) -> dict:
    tagged = [c for c in cases if c.get("license")]
    dist = dict(Counter(c["license"] for c in tagged).most_common())
    return {
        "license_distribution": dist,
        # 라이선스 × 플랫폼 매트릭스 (github-pages는 GitHub로 합산)
        "license_matrix": {
            name: {"github": sum(1 for c in tagged if c["license"] == name
                                 and c.get("license_source") in ("github", "github-pages")),
                   "gitlab": sum(1 for c in tagged if c["license"] == name
                                 and c.get("license_source") == "gitlab")}
            for name in dist
        },
        "license_by_source": {
            src: {"total": sum(1 for c in cases if c.get("license_source") == src),
                  "stated": sum(1 for c in cases if c.get("license_source") == src
                                and c["license"] != "명시 없음")}
            for src in ("github", "github-pages", "gitlab")
        },
    }


def mcp_summary(mcp_cases: list, ev_by_id: dict) -> dict:
    """MCP 현황 — 공급/소비·공식/비공식·완결성."""
    return {
        "total": len(mcp_cases),
        "official": sum(1 for c in mcp_cases if c.get("mcp_official") is True),
        "unofficial": sum(1 for c in mcp_cases if c.get("mcp_official") is False),
        "roles": dict(Counter((ev_by_id.get(c["id"], {}).get("mcp_role") or "미상") for c in mcp_cases)),
        "c_grades": dict(Counter((ev_by_id.get(c["id"], {}).get("c") or "미상") for c in mcp_cases)),
        "maintenance": dict(Counter(c.get("maintenance") for c in mcp_cases if c.get("maintenance"))),
    }


def build() -> dict:
    cases = read_json("data/cases.json")["cases"]
    evals = read_json("site/data/evaluations.json")["cases"]
    champ_doc = read_json("site/data/champions.json")
    today = kst_today()  # 한 번만 — 자정 즈음 generated_at과 quarter가 어긋나지 않게
    champ_of_case = {}
    for ch in champ_doc.get("champions", []):
        for cid in ch.get("cases", []):
            champ_of_case.setdefault(cid, []).append(ch["name"])
    ev_by_id = {e["id"]: e for e in evals}
    mcp_cases = [c for c in cases if is_mcp(c)]
    lic = sum(1 for c in cases if c.get("license"))
    lic_stated = sum(1 for c in cases if c.get("license") and c["license"] != "명시 없음")
    bridge, mirror_pairs = gitlab_bridge(cases)
    # 키 순서가 곧 공개 파일의 순서다 — 섹션을 원래 순서대로 잇는다
    return {
        **overview(today, cases, champ_doc, load_json("site/data/community.json", default={})),
        **evaluation_axes(evals),
        **model_rates(cases),
        "license_tagged": lic,
        "license_stated_rate": round(lic_stated / lic, 3) if lic else None,
        **bridge,
        "mcp_cases": len(mcp_cases),
        "transition_funnel": dict(Counter(c.get("transition_stage") or "미확인" for c in cases)),
        "unknown_rates": unknown_rates(evals),
        # 저장소 지표 (관측소 확장): 스타·유지보수 — GitHub/공공 깃랩 분리 집계
        "maintenance_distribution": dict(Counter(c.get("maintenance") for c in cases if c.get("maintenance"))),
        "stars_collected": sum(1 for c in cases if c.get("stars") is not None),
        "repo_stats": {
            "gitlab": platform_repos(cases, champ_of_case, "stars_gitlab", "gitlab.aigov"),
            "github": platform_repos(cases, champ_of_case, "stars_github", "github.com"),
        },
        **license_details(cases),
        "mcp_stats": mcp_summary(mcp_cases, ev_by_id),
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
        (re.compile(r"OpenAI 호환|Ollama|vLLM|LiteLLM|LM Studio|WebGPU", re.I), "로컬 서빙(Ollama·vLLM 등)"),
        (re.compile(r"GPT|OpenAI", re.I), "GPT(OpenAI)"),
        (re.compile(r"Claude|Codex|Anthropic|상용 코딩 에이전트", re.I), "Claude/Codex(상용 에이전트)"),
        (re.compile(r"Qwen", re.I), "Qwen"),
        (re.compile(r"GLM", re.I), "GLM"),
        (re.compile(r"Whisper", re.I), "Whisper"),
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
    LLM_DEPS = ["국산 독자모델", "국산 오픈웨이트", "혼합", "해외 상용 API", "해외 오픈웨이트(로컬)"]
    dist_detail = {}
    for c in cases:
        dep = c.get("model_dependency") or "미확인"
        d = dist_detail.setdefault(dep, {"n": 0, "specified": 0})
        d["n"] += 1
        if c.get("models_used"):
            d["specified"] += 1

    # 분류별 패밀리 구성 — 소계(사례 수)가 분포 표 건수와 정확히 일치하도록 분류 안에서 집계
    models_by_dep = []
    for dep in LLM_DEPS:
        dep_cases = [c for c in cases if c.get("model_dependency") == dep]
        if not dep_cases:
            continue
        fams2: dict[str, dict] = {}
        for c in dep_cases:
            seen = set()
            for m in c.get("models_used") or []:
                fam = family_of(m)
                e = fams2.setdefault(fam, {"name": fam, "n": 0, "cases": [],
                                           "domestic": bool(dom_re.search(fam)), "variants": set()})
                e["variants"].add(m)
                if fam not in seen:
                    e["n"] += 1
                    e["cases"].append({"id": c["id"], "title": c["title"]})
                    seen.add(fam)
        fam_list = sorted(fams2.values(), key=lambda e: -e["n"])
        for e in fam_list:
            e["variants"] = sorted(e["variants"])
        models_by_dep.append({"dep": dep, "n": len(dep_cases), "families": fam_list})
    return {"models_top": models_top, "domestic_cases": domestic_cases,
            "dist_detail": dist_detail, "models_by_dep": models_by_dep}


def main():
    doc = build()
    write_json_if_changed(OUT, doc)
    print(f"{OUT} ← 지수 갱신 ({doc['quarter']})")
    if "--snapshot" in sys.argv:
        SNAP_DIR.mkdir(exist_ok=True)
        snap = SNAP_DIR / f"{doc['quarter']}.json"
        write_json(snap, doc)
        print(f"{snap} ← 분기 스냅샷 고정")


if __name__ == "__main__":
    main()
