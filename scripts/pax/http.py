"""네트워크 조회 한 곳 — curl·gh를 같은 시간 제한·재시도로 부른다.

라이선스·헬스 점검·챔피언·뉴스·영상이 저마다 curl/gh를 12~30초 제각각의 시간 제한으로 부르고
재시도가 없어, 순간적인 연결 실패가 '라이선스 확인 실패'·'죽은 링크'로 기록됐다.
일시 오류(DNS·연결·시간 초과·TLS·빈 응답, GitHub 5xx)만 두 번 더 시도하고, 404 같은 영구 실패는 바로 돌려준다.
"""
from __future__ import annotations

import json
import re
import subprocess
import time
from typing import Any

TIMEOUT_S = 20          # curl --max-time(전송 전체)
GH_TIMEOUT_S = 30
RETRIES = 2             # 일시 오류일 때 더 시도하는 횟수
RETRY_WAIT_S = (1, 3)   # 시도 사이 대기(초)
USER_AGENT = "Mozilla/5.0 (compatible; PAX-archive/1.0)"
TRANSIENT_CURL = {6, 7, 28, 35, 52, 56}  # DNS 실패·연결 실패·시간 초과·TLS·빈 응답·수신 실패
TRANSIENT_GH = re.compile(r"HTTP 5\d\d|timeout|timed out|connection|EOF", re.I)


def _wait(attempt: int, sleep) -> None:
    sleep(RETRY_WAIT_S[min(attempt, len(RETRY_WAIT_S) - 1)])


def curl(url: str, *extra: str, timeout: int = TIMEOUT_S, binary: bool = False,
         retries: int = RETRIES, run=subprocess.run, sleep=time.sleep):
    """curl -sL로 연다. CompletedProcess(마지막 시도)를 돌려주고, curl이 없으면 None.
    extra는 -I·-o·-w·--max-filesize 같은 추가 인자(주소 앞에 붙는다)."""
    cmd = ["curl", "-sL", "--max-time", str(timeout), "-A", USER_AGENT, *extra, url]
    result = None
    for attempt in range(retries + 1):
        try:
            result = run(cmd, capture_output=True, text=not binary, timeout=timeout + 10)
        except FileNotFoundError:
            return None
        except subprocess.TimeoutExpired:
            result = None
        if result is not None and result.returncode not in TRANSIENT_CURL:
            return result
        if attempt < retries:
            _wait(attempt, sleep)
    return result


def curl_json(url: str, **kw) -> Any:
    """JSON 응답을 파싱해 돌려준다. 실패·JSON 아님이면 None."""
    r = curl(url, **kw)
    if r is None or r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


def gh_api(path: str, jq: str | None = None, timeout: int = GH_TIMEOUT_S, retries: int = RETRIES,
           run=subprocess.run, sleep=time.sleep) -> Any:
    """gh api 결과(JSON)를 돌려준다. 404·권한 오류는 바로 None, 5xx·시간 초과는 다시 시도."""
    cmd = ["gh", "api", path] + (["--jq", jq] if jq else [])
    for attempt in range(retries + 1):
        try:
            r = run(cmd, capture_output=True, text=True, timeout=timeout)
        except FileNotFoundError:
            return None
        except subprocess.TimeoutExpired:
            r = None
        if r is not None and r.returncode == 0:
            try:
                return json.loads(r.stdout)
            except json.JSONDecodeError:
                return None
        if r is not None and not TRANSIENT_GH.search(r.stderr or ""):
            return None
        if attempt < retries:
            _wait(attempt, sleep)
    return None
