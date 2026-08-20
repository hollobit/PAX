#!/usr/bin/env python3
"""사례 대상 URL의 생존과 저장소 유지보수 상태를 점검해 cases.json에 기록한다.

- link_ok: 대상 URL(case_url 우선, 없으면 link)이 응답하는가 (HEAD→GET 폴백)
- maintenance: 저장소 최근 활동 기준 활발(≤60일)/정체(≤180일)/방치(>180일)
- health_checked: 점검일

로드맵 1-6: "이미 안 되는 도구가 정상처럼 보이는" 구조의 해소.
사용: python3 scripts/check_health.py  (전건 재점검 — 주 1회 권장)
"""
import concurrent.futures
import datetime
import json
import re
import subprocess
import urllib.parse

CASES = "data/cases.json"
ACTIVE_DAYS, STALE_DAYS = 60, 180


def http_status(url: str) -> int:
    for method in (["-I"], []):  # HEAD 먼저, 405 등이면 GET
        try:
            r = subprocess.run(
                ["curl", "-sL", "--max-time", "12", "-o", "/dev/null",
                 "-w", "%{http_code}", *method, url],
                capture_output=True, text=True, timeout=20)
            code = int(r.stdout or 0)
            if code and code != 405:
                return code
        except Exception:
            pass
    return 0


def repo_activity(url: str):
    """저장소 (최근 활동 ISO, 스타 수) 또는 (None, None)."""
    m = re.match(r"https://github\.com/([\w.\-]+/[\w.\-]+)", url)
    if m:
        r = subprocess.run(["gh", "api", f"repos/{m.group(1)}", "--jq",
                            '{p: .pushed_at, s: .stargazers_count}'],
                           capture_output=True, text=True, timeout=30)
        if r.returncode == 0:
            try:
                info = json.loads(r.stdout)
                return info.get("p"), info.get("s")
            except Exception:
                pass
        return None, None
    m = re.match(r"https://gitlab\.aigov\.go\.kr/([\w.\-/]+?)/?$", url)
    if m:
        pid = urllib.parse.quote(m.group(1), safe="")
        r = subprocess.run(["curl", "-sL", "--max-time", "12",
                            f"https://gitlab.aigov.go.kr/api/v4/projects/{pid}"],
                           capture_output=True, text=True, timeout=20)
        try:
            info = json.loads(r.stdout)
            return info.get("last_activity_at"), info.get("star_count")
        except Exception:
            return None, None
    return None, None


def check_case(c):
    target = c.get("case_url") or c.get("link")
    if not target:
        return c["id"], None, None, None
    code = http_status(target)
    link_ok = 200 <= code < 400
    maint = stars = None
    for u in (c.get("link"), c.get("case_url")):
        if u and ("github.com/" in u or "gitlab.aigov" in u):
            ts, stars = repo_activity(u)
            if ts:
                age = (datetime.datetime.now(datetime.timezone.utc)
                       - datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))).days
                maint = "활발" if age <= ACTIVE_DAYS else ("정체" if age <= STALE_DAYS else "방치")
            break
    return c["id"], link_ok, maint, stars


def main():
    data = json.load(open(CASES))
    cases = data["cases"]
    today = datetime.date.today().isoformat()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        results = {cid: (ok, maint, stars) for cid, ok, maint, stars in ex.map(check_case, cases)}
    dead = active = stale = idle = 0
    for c in cases:
        ok, maint, stars = results.get(c["id"], (None, None, None))
        if stars is not None:
            c["stars"] = stars
        if ok is None:
            continue
        c["link_ok"] = ok
        c["health_checked"] = today
        if maint:
            c["maintenance"] = maint
            active += maint == "활발"; stale += maint == "정체"; idle += maint == "방치"
        if not ok:
            dead += 1
            print(f"  링크 끊김: {c['title'][:40]} ← {c.get('case_url') or c.get('link')}")
    json.dump(data, open(CASES, "w"), ensure_ascii=False, indent=1)
    print(f"점검 완료 — 끊김 {dead}건 / 유지보수: 활발 {active}·정체 {stale}·방치 {idle}")


if __name__ == "__main__":
    main()
