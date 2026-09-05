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
CERTS = Path("docs/champion_certifications.json")
CACHE = Path("data/champion_profiles.json")
OUT = Path("site/data/champions.json")

# 계정으로 취급하지 않는 이름 (탐색 경로·조직 페이지)
EXCLUDE_ACCOUNTS = {"github:features", "gitlab:explore"}

AX_LEVEL = {"AI-Ready": 1, "AI-Enabled": 2, "AI-First": 3, "AI-Native": 4}

RE_GITHUB = re.compile(r"https://github\.com/([A-Za-z0-9_.-]+)/")
RE_GITLAB = re.compile(r"https://gitlab\.aigov\.go\.kr/([A-Za-z0-9_.-]+)/")
RE_GHIO = re.compile(r"https://([a-z0-9-]+)\.github\.io")
RE_THREADS = re.compile(r"https://www\.threads\.(?:com|net)/@([A-Za-z0-9_.]+)/")


NON_CHAMPION_ORG_TYPES = {"민간(참고)", "해외(참고)"}


def is_champion_source(case: dict) -> bool:
    """참고 분류(민간·해외) 사례의 계정은 공공AX 챔피언으로 추출하지 않는다."""
    return case.get("org_type") not in NON_CHAMPION_ORG_TYPES


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


# 조직 토큰 판별: 마지막 어절이 이 접미사로 끝나면 소속 경로의 일부로 본다
ORG_TOKEN = re.compile(
    r"(?:시|군|구|도|청|처|부|원|공사|공단|협력단|사업단|유통|의회|재단|진흥원|연구원|교육청|"
    r"위원회|대학교?|소방서|경찰서|세관|우체국|보건소|본부|지청|지사|센터|실|과|팀|단|관|"
    r"학교|연구소)$")
# 광역시도 축약형('경남 양산시 …')도 조직 경로 토큰으로 인정
REGION_TOKEN = re.compile(r"^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)$")
# 표시명 말미의 직급은 이름이 아니다 — 분리 전에 떼어낸다
TITLE_TOKEN = re.compile(
    r"^(주무관|사무관|서기관|행정관|연구사|연구관|장학사|장학관|주사보?|서기|주임|팀장|과장|계장|"
    r"실장|소장|센터장|부장|차장|대리|사원|교사|교감|교장|분석관|전산\w*)$")
KOREAN_NAME = re.compile(r"[가-힣]{2,4}$")


def split_gitlab_name(full: str) -> tuple[str | None, str]:
    """공공 GitLab 표시명을 (소속, 이름)으로 정규화한다. 실패 시 (None, 원문).

    - '고용노동부 강기륜', '완주소방서 김무영', 다중 어절 조직 경로+이름을 분리
    - first/last name 역순 표기('진희 안')는 성+이름으로 재결합
    """
    tokens = full.strip().split()
    # 말미 직급 제거 ('광양시 조재원 주무관' → '광양시 조재원')
    while len(tokens) >= 2 and TITLE_TOKEN.fullmatch(tokens[-1]):
        tokens = tokens[:-1]
    if len(tokens) >= 2 and KOREAN_NAME.fullmatch(tokens[-1]):
        org_tokens = tokens[:-1]
        if all(ORG_TOKEN.search(tok) or REGION_TOKEN.fullmatch(tok) for tok in org_tokens):
            return " ".join(org_tokens), tokens[-1]
    if (len(tokens) == 2 and re.fullmatch(r"[가-힣]", tokens[1])
            and re.fullmatch(r"[가-힣]{1,2}", tokens[0])):
        return None, tokens[1] + tokens[0]
    return None, full.strip()


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
        if not is_champion_source(c):
            case_owners[c["id"]] = set()
            threads_of_case[c["id"]] = set()
            continue
        repo, threads = extract_accounts(c)
        owners = repo if repo else threads
        case_owners[c["id"]] = owners
        threads_of_case[c["id"]] = threads
        all_accounts |= repo | threads

    # 1.5) 동일 계정명 프로브 — GitHub 계정과 같은 ID가 공공 GitLab에 있으면
    #      같은 사람으로 자동 연결하고 GitLab 프로필을 우선 사용한다 (캐시: probe: 접두)
    cache = load_json(CACHE, {})
    auto_links: dict[str, str] = {}  # github:<n> → gitlab:<n>
    for acct in sorted(a for a in all_accounts if a.startswith("github:")):
        name = acct.split(":", 1)[1]
        probe_key = f"probe:gitlab:{name}"
        if probe_key not in cache and not no_fetch:
            cache[probe_key] = fetch_profile(f"gitlab:{name}") or {"missing": True}
        probe = cache.get(probe_key) or {"missing": True}
        if not probe.get("missing"):
            gl = f"gitlab:{name}"
            cache.setdefault(gl, {k: v for k, v in probe.items() if k != "missing"})
            all_accounts.add(gl)
            auto_links[acct] = gl

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
                       "affiliation": entry.get("affiliation"),
                       "name": entry.get("name"),
                       "extra_cases": entry.get("extra_cases", [])}
        for a in entry["accounts"]:
            acct_to_champion[a] = cid
    for gh_acct, gl_acct in auto_links.items():
        champ = acct_to_champion.get(gh_acct, gh_acct)
        acct_to_champion.setdefault(gh_acct, champ)
        acct_to_champion[gl_acct] = champ
        entry = merged.setdefault(champ, {"accounts": [gh_acct], "affiliation": None})
        if gl_acct not in entry["accounts"]:
            entry["accounts"].append(gl_acct)
    for a in sorted(all_accounts):
        acct_to_champion.setdefault(a, a)  # 미연결 계정은 단독 챔피언

    # 3) 챔피언별 사례 귀속 — 병합된 스레드 핸들은 저장소 사례도 함께 소유.
    #    연결 파일의 extra_cases(수동 귀속, 근거 필수)도 해당 챔피언에 귀속된다.
    manual_case_of: dict[str, str] = {}
    for cid, info in merged.items():
        for case_id in info.get("extra_cases", []):
            manual_case_of[case_id] = cid
    champ_cases: dict[str, list] = {}
    for c in cases:
        owners = set(case_owners[c["id"]])
        # 스레드 핸들이 저장소 계정과 같은 챔피언으로 병합돼 있으면 소유 인정
        for t in threads_of_case[c["id"]]:
            if acct_to_champion.get(t) in {acct_to_champion.get(o) for o in owners}:
                owners.add(t)
        champs = {acct_to_champion[o] for o in owners if o in acct_to_champion}
        if c["id"] in manual_case_of:
            champs.add(manual_case_of[c["id"]])
        for ch in champs:
            champ_cases.setdefault(ch, []).append(c)

    # 4) 프로필 조회 (캐시 우선)
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
        # 표시이름·소속: 공공 GitLab 프로필 우선(실명·기관 정확도가 가장 높음),
        # 없으면 GitHub 프로필, 그다음 계정명
        gitlab_name = None
        github_name = None
        company = None
        for a in accounts:
            p = cache.get(a) or {}
            if a.startswith("gitlab:") and p.get("name"):
                gitlab_name = gitlab_name or p["name"]
            if a.startswith("github:"):
                github_name = github_name or p.get("name")
                company = company or p.get("company")
        aff = merged.get(cid, {}).get("affiliation")
        curated_name = merged.get(cid, {}).get("name")
        name = (curated_name or gitlab_name or github_name or cid.split(":", 1)[-1]).strip()
        if gitlab_name:
            org, person = split_gitlab_name(gitlab_name)
            name = person
            if org:
                if not aff or aff.get("inferred"):
                    aff = {"value": org, "inferred": False,
                           "evidence": "공공 GitLab 공개 프로필 표시명"}
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
    # 5.5) 외부 인증(AI 챔피언 기록 저장소) 연결 — 성명·기관 일치 확인분만
    certs_doc = load_json(CERTS, {})
    cert_by_champ = {c["champion"]: c for c in certs_doc.get("certified", [])}
    cert_source = certs_doc.get("source", {})
    for ch in champions:
        cert = cert_by_champ.get(ch["id"])
        if cert:
            ch["certification"] = {
                "tier": cert["tier"],
                "listed_as": cert.get("listed_as"),
                "source_name": cert_source.get("name"),
                "source_url": cert_source.get("url"),
            }

    champions.sort(key=lambda x: x["name"])

    # 참조 무결성 경고
    case_ids = {c["id"] for c in cases}
    for ch in champions:
        for i in ch["cases"]:
            if i not in case_ids:
                print(f"경고: 챔피언 {ch['id']}의 사례 {i}가 cases.json에 없음", file=sys.stderr)

    # 6) 챔피언 미확인 사례 — 귀속 계정이 하나도 없는 사례 목록
    unattributed = [
        {"id": c["id"], "title": c["title"], "org": c["org"],
         "url": c.get("case_url") or c.get("link")}
        for c in cases if not case_owners[c["id"]] and c["id"] not in manual_case_of
    ]

    doc = {"total": len(champions), "champions": champions,
           "unattributed": unattributed}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} ← 챔피언 {len(champions)}명 (프로필 신규 조회 {fetched}건)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
