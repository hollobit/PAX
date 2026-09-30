from check_repo import find_id_literals, find_private_paths, find_secret_keys, invalid_json


def test_private_paths_are_flagged():
    tracked = ["data/cases.json", "data/raw/2026-09-30-kakao.json", "log.md", "data/state.json",
               ".claude/skills/x/SKILL.md", "site/city3d/js/.claude/sessions/a.json",
               "data/private/watchdog.log", "data/champion_profiles.json", "site/index.html"]
    assert find_private_paths(tracked) == [
        "data/raw/2026-09-30-kakao.json", "log.md", "data/state.json", ".claude/skills/x/SKILL.md",
        "site/city3d/js/.claude/sessions/a.json", "data/private/watchdog.log", "data/champion_profiles.json"]


def test_long_numeric_id_literals_are_flagged():
    # 카카오 채팅방 ID처럼 15자리 이상 숫자를 따옴표로 박은 코드를 잡는다
    assert find_id_literals('CHAT_ID = "123456789012345678"\n') == ["123456789012345678"]
    assert find_id_literals("x = '999999999999999'") == ["999999999999999"]
    assert find_id_literals('n = 1790680987  # 10자리 타임스탬프') == []
    assert find_id_literals('v = "2026-09-30T00:00:00Z"') == []


def test_service_role_jwt_is_flagged_but_anon_is_not():
    import base64
    import json

    def jwt(role):
        body = base64.urlsafe_b64encode(json.dumps({"role": role}).encode()).decode().rstrip("=")
        return f"eyJhbGciOiJIUzI1NiJ9.{body}.sig"
    assert find_secret_keys(f'KEY = "{jwt("anon")}"') == []
    assert find_secret_keys(f'KEY = "{jwt("service_role")}"') == ["service_role JWT"]


def test_invalid_json_detected(tmp_path):
    good = tmp_path / "a.json"
    good.write_text('{"a": 1}', encoding="utf-8")
    bad = tmp_path / "b.json"
    bad.write_text('{"a": ', encoding="utf-8")
    assert invalid_json([good, bad]) == [str(bad)]
