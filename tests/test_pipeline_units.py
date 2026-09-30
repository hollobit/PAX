"""공개 수치를 만들거나 원장을 직접 고치는 스크립트의 핵심 판단 — 네트워크는 가짜로 바꿔 끼운다."""
import datetime
import json

import build_dashboard_history as bdh
import build_index as bi
import check_health as ch
import tag_licenses as tl
from conftest import make_case


# ---- check_health: 링크 생존·유지보수 단계·플랫폼별 스타 ------------------------------------
def _iso_days_ago(days):
    t = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def test_check_case_classifies_maintenance_and_keeps_stars_per_platform(monkeypatch):
    monkeypatch.setattr(ch, "http_status", lambda url: 200)
    activity = {"https://github.com/a/b": (_iso_days_ago(10), 7),
                "https://gitlab.aigov.go.kr/a/b": (_iso_days_ago(400), 2)}
    monkeypatch.setattr(ch, "repo_activity", lambda u: activity.get(u, (None, None)))
    c = make_case(source="kakao", link="https://github.com/a/b", mirror_url="https://gitlab.aigov.go.kr/a/b")
    cid, ok, maint, stars = ch.check_case(c)
    assert ok is True and maint == "활발"            # 첫 저장소(GitHub)의 최근 활동 기준
    assert stars == {"github": 7, "gitlab": 2}


def test_check_case_marks_dead_links_and_stale_repos(monkeypatch):
    monkeypatch.setattr(ch, "http_status", lambda url: 404)
    monkeypatch.setattr(ch, "repo_activity", lambda u: (_iso_days_ago(100), None))
    _, ok, maint, _ = ch.check_case(make_case(source="kakao", link="https://github.com/a/b"))
    assert ok is False and maint == "정체"
    monkeypatch.setattr(ch, "repo_activity", lambda u: (_iso_days_ago(ch.STALE_DAYS + 1), None))
    assert ch.check_case(make_case(source="kakao", link="https://github.com/a/b"))[2] == "방치"


def test_check_case_skips_cases_without_address():
    c = make_case(source="kakao", link=None)
    assert ch.check_case(c) == (c["id"], None, None, {})


# ---- tag_licenses: 저장소 판별·라이선스 표기 정규화 ------------------------------------------
def test_repo_of_prefers_github_then_gitlab_then_pages():
    assert tl.repo_of({"link": "https://github.com/a/b.git"}) == ("github", "a/b")
    assert tl.repo_of({"link": "https://gitlab.aigov.go.kr/g/p"}) == ("gitlab", "https://gitlab.aigov.go.kr/g/p")
    assert tl.repo_of({"case_url": "https://user.github.io/tool/"}) == ("github-pages", "user/tool")
    assert tl.repo_of({"case_url": "https://user.github.io/"}) == ("github-pages", "user/user.github.io")
    assert tl.repo_of({"link": "https://github.com/orgs/x"}) == (None, None)


def test_github_license_mapping(monkeypatch):
    monkeypatch.setattr(tl, "gh_api", lambda *a, **k: {"spdx": "MIT", "name": "MIT License"})
    assert tl.github_license("a/b") == "MIT"
    monkeypatch.setattr(tl, "gh_api", lambda *a, **k: {"spdx": None, "name": None})
    assert tl.github_license("a/b") == "명시 없음"
    monkeypatch.setattr(tl, "gh_api", lambda *a, **k: {"spdx": "NOASSERTION", "name": "Custom"})
    assert tl.github_license("a/b") == "Custom"
    monkeypatch.setattr(tl, "gh_api", lambda *a, **k: None)
    assert tl.github_license("a/b") is None  # 확인 실패는 '명시 없음'과 구분한다


def test_gitlab_license_normalizes_labels(monkeypatch):
    monkeypatch.setattr(tl, "curl_json", lambda *a, **k: {"id": 1, "license": {"key": "apache-2.0"}})
    assert tl.gitlab_license("https://gitlab.aigov.go.kr/g/p") == "Apache-2.0"
    monkeypatch.setattr(tl, "curl_json", lambda *a, **k: {"id": 1, "license": None})
    assert tl.gitlab_license("https://gitlab.aigov.go.kr/g/p") == "명시 없음"
    monkeypatch.setattr(tl, "curl_json", lambda *a, **k: {"message": "404"})
    assert tl.gitlab_license("https://gitlab.aigov.go.kr/g/p") is None


# ---- 공개 비율의 분모 ------------------------------------------------------------------
def test_model_rates_use_llm_cases_as_denominator():
    # 비LLM 도구·모델 중립은 채택률 분모에서 뺀다(AGENTS.md §5)
    cases = [make_case(model_dependency=d) for d in
             ("국산 독자모델", "해외 상용 API", "없음(비LLM)", "모델 중립(BYO)", "국산 오픈웨이트")]
    m = bdh.measure(cases)
    assert m["total_cases"] == 5
    assert m["domestic_model_rate"] == round(2 / 3, 4)
    assert m["local_model_rate"] == round(1 / 3, 4)  # 국산 오픈웨이트도 공개 가중치 로컬 실행이다


def test_gauge_and_delta_badge_use_the_same_definition():
    # 관측소 게이지(지수)와 증감 배지(이력)가 같은 사례에서 같은 비율을 내야 한다
    cases = [make_case(model_dependency=d) for d in
             ("국산 오픈웨이트", "해외 오픈웨이트(로컬)", "해외 상용 API", "혼합", "없음(비LLM)")]
    idx, hist = bi.model_rates(cases), bdh.measure(cases)
    assert round(idx["domestic_model_rate"], 3) == round(hist["domestic_model_rate"], 3)
    assert round(idx["local_model_rate"], 3) == round(hist["local_model_rate"], 3)


def test_required_input_warns_instead_of_silently_zeroing(tmp_path, capsys):
    assert bdh.required_input(str(tmp_path / "none.json")) == {}
    assert "읽지 못해" in capsys.readouterr().err


def test_c_score():
    assert [bi.c_score(g) for g in ("C0", "C3", "C", None, "S1")] == [0, 3, None, None, None]


def test_index_build_counts_from_ledgers(tmp_path, monkeypatch):
    (tmp_path / "data").mkdir()
    (tmp_path / "site" / "data").mkdir(parents=True)
    cases = [make_case(id="a" * 16, title="MCP 서버", tags=["MCP"], model_dependency="없음(비LLM)"),
             make_case(id="b" * 16, model_dependency="국산 독자모델", license="MIT"),
             make_case(id="c" * 16, model_dependency="해외 상용 API")]
    evals = [{"id": c["id"], "ax": "AI-Ready", "c": "C1", "p": "P1", "s": "S1"} for c in cases]
    (tmp_path / "data" / "cases.json").write_text(json.dumps({"cases": cases}, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "site" / "data" / "evaluations.json").write_text(json.dumps({"cases": evals}), encoding="utf-8")
    (tmp_path / "site" / "data" / "champions.json").write_text(json.dumps({"total": 1, "champions": []}),
                                                               encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    doc = bi.build()
    assert doc["total_cases"] == 3 and doc["total_champions"] == 1
    assert doc["mcp_cases"] == 1
    assert doc["domestic_model_rate"] == 0.5  # 분모는 LLM을 쓰는 2건


def test_http_status_uses_short_budget_and_falls_back_to_get(monkeypatch):
    calls = []

    def fake_curl(url, *extra, **kw):
        calls.append((extra, kw))
        return type("P", (), {"stdout": "405" if "-I" in extra else "200"})()
    monkeypatch.setattr(ch, "curl", fake_curl)
    assert ch.http_status("https://a.example/") == 200
    assert len(calls) == 2  # HEAD가 405면 GET으로 다시
    assert all(kw == {"timeout": ch.LINK_TIMEOUT_S, "retries": ch.LINK_RETRIES} for _, kw in calls)
