"""사례 데이터에서 챔피언(개발자) 디렉토리를 생성한다.

입력: data/cases.json, site/data/evaluations.json, docs/champion_links.json,
      (캐시) data/champion_profiles.json
출력: site/data/champions.json

사용법: python3 scripts/build_champions.py [--no-fetch]
  --no-fetch: 프로필 API 조회 없이 캐시만 사용
"""
import json
import re
import subprocess
import sys
from pathlib import Path

CASES = Path("data/cases.json")
EVALS = Path("site/data/evaluations.json")
LINKS = Path("docs/champion_links.json")
CACHE = Path("data/champion_profiles.json")
OUT = Path("site/data/champions.json")

# 계정으로 취급하지 않는 이름 (탐색 경로·조직 페이지)
EXCLUDE_ACCOUNTS = {"github:features", "gitlab:explore"}

AX_LEVEL = {"AI-Ready": 1, "AI-Enabled": 2, "AI-First": 3, "AI-Native": 4}

RE_GITHUB = re.compile(r"https://github\.com/([A-Za-z0-9_.-]+)/")
RE_GITLAB = re.compile(r"https://gitlab\.aigov\.go\.kr/([A-Za-z0-9_.-]+)/")
RE_GHIO = re.compile(r"https://([a-z0-9-]+)\.github\.io")
RE_THREADS = re.compile(r"https://www\.threads\.(?:com|net)/@([A-Za-z0-9_.]+)/")


def extract_accounts(case: dict) -> tuple[set, set]:
    """사례에서 (저장소 계정, 스레드 핸들) 집합을 추출한다."""
    repo, threads = set(), set()
    for url in (case.get("link"), case.get("case_url")):
        if not url:
            continue
        if m := RE_GITHUB.search(url):
            repo.add(f"github:{m.group(1)}")
        if m := RE_GITLAB.search(url):
            repo.add(f"gitlab:{m.group(1)}")
        if m := RE_GHIO.search(url):
            repo.add(f"github:{m.group(1)}")
        if m := RE_THREADS.search(url):
            threads.add(f"threads:{m.group(1)}")
    return repo - EXCLUDE_ACCOUNTS, threads - EXCLUDE_ACCOUNTS


def account_url(acct: str) -> str:
    platform, name = acct.split(":", 1)
    return {
        "github": f"https://github.com/{name}",
        "gitlab": f"https://gitlab.aigov.go.kr/{name}",
        "threads": f"https://www.threads.com/@{name}",
    }[platform]


def fetch_profile(acct: str) -> dict | None:
    """공개 프로필(표시이름·소속)을 조회한다. 실패 시 None."""
    platform, name = acct.split(":", 1)
    try:
        if platform == "github":
            out = subprocess.run(
                ["gh", "api", f"users/{name}", "--jq",
                 '{name: .name, company: .company, bio: .bio}'],
                capture_output=True, text=True, timeout=20)
            if out.returncode == 0:
                return json.loads(out.stdout)
        elif platform == "gitlab":
            out = subprocess.run(
                ["curl", "-sL", "--max-time", "15",
                 f"https://gitlab.aigov.go.kr/api/v4/users?username={name}"],
                capture_output=True, text=True, timeout=25)
            if out.returncode == 0:
                users = json.loads(out.stdout)
                if isinstance(users, list) and users:
                    return {"name": users[0].get("name"), "company": None, "bio": None}
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        pass
    return None


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def main() -> int:
    no_fetch = "--no-fetch" in sys.argv
    cases = load_json(CASES, {}).get("cases", [])
    evals = {c["id"]: c for c in load_json(EVALS, {}).get("cases", [])}
    if not cases:
        print("오류: cases.json을 읽을 수 없습니다", file=sys.stderr)
        return 1

    # 1) 사례별 계정 추출 — 저장소 계정이 있으면 그 계정이 사례를 소유,
    #    스레드 핸들은 저장소 계정이 없는 사례에서만 단독 소유자가 된다.
    case_owners: dict[str, set] = {}
    all_accounts: set = set()
    threads_of_case: dict[str, set] = {}
    for c in cases:
        repo, threads = extract_accounts(c)
        owners = repo if repo else threads
        case_owners[c["id"]] = owners
        threads_of_case[c["id"]] = threads
        all_accounts |= repo | threads

    # 2) 승인된 연결로 챔피언 단위 병합 (근거 필수)
    links = load_json(LINKS, [])
    merged: dict[str, dict] = {}   # champion id → {accounts, affiliation}
    acct_to_champion: dict[str, str] = {}
    for entry in links:
        if not entry.get("evidence"):
            print(f"경고: 근거 없는 연결 건너뜀 — {entry.get('champion')}", file=sys.stderr)
            continue
        cid = entry["champion"]
        merged[cid] = {"accounts": entry["accounts"],
                       "affiliation": entry.get("affiliation")}
        for a in entry["accounts"]:
            acct_to_champion[a] = cid
    for a in sorted(all_accounts):
        acct_to_champion.setdefault(a, a)  # 미연결 계정은 단독 챔피언

    # 3) 챔피언별 사례 귀속 — 병합된 스레드 핸들은 저장소 사례도 함께 소유
    champ_cases: dict[str, list] = {}
    for c in cases:
        owners = set(case_owners[c["id"]])
        # 스레드 핸들이 저장소 계정과 같은 챔피언으로 병합돼 있으면 소유 인정
        for t in threads_of_case[c["id"]]:
            if acct_to_champion.get(t) in {acct_to_champion.get(o) for o in owners}:
                owners.add(t)
        champs = {acct_to_champion[o] for o in owners if o in acct_to_champion}
        for ch in champs:
            champ_cases.setdefault(ch, []).append(c)

    # 4) 프로필 조회 (캐시 우선)
    cache = load_json(CACHE, {})
    fetched = 0
    for acct in sorted(all_accounts):
        if acct.startswith("threads:"):
            continue  # 스레드는 프로필 API 없음
        if acct in cache or no_fetch:
            continue
        profile = fetch_profile(acct)
        cache[acct] = profile or {}
        fetched += 1
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    # 5) 챔피언 레코드 생성
    champions = []
    for cid, clist in champ_cases.items():
        accounts = merged.get(cid, {}).get("accounts") or [cid]
        # 표시이름: 프로필 name 우선, 없으면 계정명
        display = None
        company = None
        for a in accounts:
            p = cache.get(a) or {}
            display = display or p.get("name")
            company = company or p.get("company")
        name = (display or cid.split(":", 1)[-1]).strip()
        aff = merged.get(cid, {}).get("affiliation")
        if not aff and company:
            aff = {"value": company.lstrip("@").strip(), "inferred": False,
                   "evidence": "GitHub 공개 프로필 소속란"}
        top_ax = max((AX_LEVEL.get(evals.get(c["id"], {}).get("ax"), 0) for c in clist), default=0)
        stars = sum(c.get("popularity") or 0 for c in clist)
        champions.append({
            "id": cid,
            "name": name,
            "accounts": [{"platform": a.split(":")[0], "id": a.split(":", 1)[1],
                          "url": account_url(a)} for a in accounts],
            "affiliation": aff,
            "cases": [c["id"] for c in sorted(clist, key=lambda x: x["date"], reverse=True)],
            "stats": {"case_count": len(clist), "top_ax": top_ax, "stars": stars},
        })
    champions.sort(key=lambda x: x["name"])

    # 참조 무결성 경고
    case_ids = {c["id"] for c in cases}
    for ch in champions:
        for i in ch["cases"]:
            if i not in case_ids:
                print(f"경고: 챔피언 {ch['id']}의 사례 {i}가 cases.json에 없음", file=sys.stderr)

    doc = {"total": len(champions), "champions": champions}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} ← 챔피언 {len(champions)}명 (프로필 신규 조회 {fetched}건)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
