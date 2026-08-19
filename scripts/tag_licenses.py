#!/usr/bin/env python3
"""사례 저장소의 라이선스를 확인해 cases.json에 태깅한다.

- GitHub: `gh api repos/{owner}/{repo}` 의 license.spdx_id (인증된 gh CLI 사용)
- 공공 GitLab(gitlab.aigov.go.kr): /api/v4/projects/:path?license=true
- 확인된 것만 기록한다 (미확인 원칙). 저장소가 있는데 라이선스 파일이 없으면 "명시 없음".
- 이미 태깅된 사례는 건너뛴다 (--refresh 시 전체 재확인).

사용: python3 scripts/tag_licenses.py [--refresh]
"""
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import date

CASES = "data/cases.json"
GITLAB_HOST = "gitlab.aigov.go.kr"


def github_license(repo: str):
    """owner/name → (spdx | '명시 없음' | None). None은 확인 실패."""
    try:
        out = subprocess.run(
            ["gh", "api", f"repos/{repo}", "--jq",
             '{spdx: .license.spdx_id, name: .license.name}'],
            capture_output=True, text=True, timeout=30)
        if out.returncode != 0:
            return None
        info = json.loads(out.stdout)
        spdx = info.get("spdx")
        if spdx is None:
            return "명시 없음"
        if spdx == "NOASSERTION":
            return info.get("name") or "기타(비표준)"
        return spdx
    except Exception:
        return None


def gitlab_license(url: str):
    m = re.match(rf"https://{GITLAB_HOST}/([\w.\-/]+?)(?:\.git)?/?$", url)
    if not m:
        return None
    path = urllib.parse.quote(m.group(1).rstrip("/"), safe="")
    api = f"https://{GITLAB_HOST}/api/v4/projects/{path}?license=true"
    try:
        out = subprocess.run(["curl", "-sL", "--max-time", "15", api],
                             capture_output=True, text=True, timeout=30)
        if out.returncode != 0 or not out.stdout.strip():
            return None
        info = json.loads(out.stdout)
        if "id" not in info:  # 404/비공개 등
            return None
        lic = info.get("license")
        if not lic:
            return "명시 없음"
        raw = lic.get("nickname") or lic.get("key", "").upper() or "기타(비표준)"
        # GitLab API 표기 정규화 — SPDX 표기와 일치시키고, 무의미한 값은 비표준 처리
        return {"APACHE-2.0": "Apache-2.0", "LICENSE": "기타(비표준)",
                "MIT LICENSE": "MIT", "GNU-AGPL-3.0": "AGPL-3.0"}.get(raw, raw)
    except Exception:
        return None


def repo_of(case):
    """사례에서 (종류, 대상) 추출 — GitHub → 공공 GitLab → GitHub Pages 순.

    GitHub Pages(*.github.io)는 소스 저장소로 역매핑한다:
    https://{user}.github.io/{repo}/... → {user}/{repo},
    루트 페이지는 {user}/{user}.github.io.
    """
    urls = [u for u in [case.get("link"), case.get("case_url")] if u]
    for u in urls:
        m = re.match(r"https://github\.com/([\w.\-]+)/([\w.\-]+)", u)
        if m and m.group(1) not in ("orgs", "topics", "search"):
            return "github", f"{m.group(1)}/{m.group(2).removesuffix('.git')}"
    for u in urls:
        if GITLAB_HOST in u and re.search(rf"{GITLAB_HOST}/[\w.\-]+/[\w.\-]+", u):
            return "gitlab", u
    for u in urls:
        m = re.match(r"https://([\w-]+)\.github\.io(?:/([\w.\-]+))?", u)
        if m:
            user = m.group(1)
            repo = m.group(2) or f"{user}.github.io"
            return "github-pages", f"{user}/{repo}"
    return None, None


def main():
    refresh = "--refresh" in sys.argv
    data = json.load(open(CASES))
    cases = data["cases"]
    today = date.today().isoformat()
    tagged = skipped = failed = 0
    for c in cases:
        if c.get("license") and not refresh:
            skipped += 1
            continue
        kind, target = repo_of(c)
        if not kind:
            continue
        lic = (gitlab_license(target) if kind == "gitlab"
               else github_license(target))  # github / github-pages 모두 GitHub API
        if lic is None:
            failed += 1
            continue
        c["license"] = lic
        c["license_source"] = kind
        c["license_checked"] = today
        tagged += 1
        print(f"  {lic:<20} [{kind}] {c['title'][:44]}")
    json.dump(data, open(CASES, "w"), ensure_ascii=False, indent=1)
    print(f"태깅 {tagged}건 / 기존 유지 {skipped}건 / 확인 실패 {failed}건 / 총 {len(cases)}건")


if __name__ == "__main__":
    main()
