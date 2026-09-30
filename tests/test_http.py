import subprocess

from pax import http


class Proc:
    def __init__(self, code=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = code, out, err


def _runner(results):
    calls = []

    def run(cmd, **kw):
        calls.append(cmd)
        r = results.pop(0)
        if isinstance(r, Exception):
            raise r
        return r
    return run, calls


def test_curl_retries_transient_failures_then_succeeds():
    run, calls = _runner([Proc(28), subprocess.TimeoutExpired("curl", 1), Proc(0, "ok")])
    r = http.curl("https://a.example/", run=run, sleep=lambda s: None)
    assert r.stdout == "ok" and len(calls) == 3
    assert calls[0][:2] == ["curl", "-sL"] and "--max-time" in calls[0] and calls[0][-1] == "https://a.example/"


def test_curl_does_not_retry_permanent_failures():
    run, calls = _runner([Proc(22)])  # HTTP 오류(-f 없이도 22 같은 코드는 일시 오류가 아니다)
    assert http.curl("https://a.example/", run=run, sleep=lambda s: None).returncode == 22
    assert len(calls) == 1


def test_curl_gives_up_after_retries_and_missing_tool_is_none():
    run, calls = _runner([Proc(7), Proc(7), Proc(7)])
    assert http.curl("https://a.example/", run=run, sleep=lambda s: None).returncode == 7
    assert len(calls) == 1 + http.RETRIES
    run, _ = _runner([FileNotFoundError()])
    assert http.curl("https://a.example/", run=run, sleep=lambda s: None) is None


def test_curl_json_parses_or_returns_none():
    run, _ = _runner([Proc(0, '{"a": 1}')])
    assert http.curl_json("https://a.example/", run=run) == {"a": 1}
    run, _ = _runner([Proc(0, "<html>")])
    assert http.curl_json("https://a.example/", run=run) is None


def test_gh_api_retries_server_errors_but_not_404():
    run, calls = _runner([Proc(1, err="HTTP 502"), Proc(0, '{"x": 1}')])
    assert http.gh_api("repos/a/b", run=run, sleep=lambda s: None) == {"x": 1}
    assert calls[0][:3] == ["gh", "api", "repos/a/b"]
    run, calls = _runner([Proc(1, err="HTTP 404: Not Found")])
    assert http.gh_api("repos/a/b", run=run, sleep=lambda s: None) is None and len(calls) == 1


def test_gh_api_passes_jq():
    run, calls = _runner([Proc(0, '{"p": "x"}')])
    http.gh_api("repos/a/b", jq="{p: .pushed_at}", run=run)
    assert calls[0][-2:] == ["--jq", "{p: .pushed_at}"]
