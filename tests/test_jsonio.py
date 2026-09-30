import json

import pytest

from pax.jsonio import read_json, write_json


def test_write_uses_ledger_format(tmp_path):
    # 원장 형식은 하나 — 한 칸 들여쓰기·한글 그대로·끝 줄바꿈. 쓰는 스크립트마다 달라지면
    # 누가 마지막에 썼느냐에 따라 diff가 파일 전체로 번진다.
    p = tmp_path / "cases.json"
    write_json(p, {"cases": [{"id": "a", "title": "한글"}]})
    text = p.read_text(encoding="utf-8")
    assert text == '{\n "cases": [\n  {\n   "id": "a",\n   "title": "한글"\n  }\n ]\n}\n'


def test_roundtrip_is_byte_stable(tmp_path):
    p = tmp_path / "x.json"
    write_json(p, {"b": 1, "a": [1, 2]})
    before = p.read_bytes()
    write_json(p, read_json(p))
    assert p.read_bytes() == before  # 키 순서도 보존한다(sort_keys 없음)


def test_write_is_atomic_on_failure(tmp_path):
    # 직렬화에 실패하면 기존 원장이 반쯤 쓰인 채로 남으면 안 된다
    p = tmp_path / "cases.json"
    write_json(p, {"ok": True})
    with pytest.raises(TypeError):
        write_json(p, {"bad": object()})
    assert json.loads(p.read_text(encoding="utf-8")) == {"ok": True}
    assert not list(tmp_path.glob("*.tmp"))


def test_write_creates_parent_dirs(tmp_path):
    p = tmp_path / "site" / "data" / "x.json"
    write_json(p, [])
    assert read_json(p) == []


def test_read_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        read_json(tmp_path / "none.json")


def test_write_if_changed_skips_when_only_timestamp_differs(tmp_path):
    # 실행 시각만 바뀐 산출물은 쓰지 않는다 — 안 그러면 '변경 없으면 커밋 안 함'이 영영 안 걸린다
    from pax.jsonio import write_json_if_changed
    p = tmp_path / "news.json"
    assert write_json_if_changed(p, {"updated_at": "2026-09-30T00:00:00Z", "items": [1]}) is True
    before = p.read_bytes()
    assert write_json_if_changed(p, {"updated_at": "2026-09-30T08:00:00Z", "items": [1]}) is False
    assert p.read_bytes() == before


def test_write_if_changed_writes_real_changes_with_new_timestamp(tmp_path):
    from pax.jsonio import write_json_if_changed
    p = tmp_path / "news.json"
    write_json_if_changed(p, {"generated_at": "2026-09-29", "items": [1]})
    assert write_json_if_changed(p, {"generated_at": "2026-09-30", "items": [1, 2]}) is True
    assert read_json(p) == {"generated_at": "2026-09-30", "items": [1, 2]}


def test_write_if_changed_compares_nested_payload_only_at_top_level_keys(tmp_path):
    # 무시하는 건 최상위 시각 필드뿐 — 사례 안의 updated_at 같은 값은 내용으로 본다
    from pax.jsonio import write_json_if_changed
    p = tmp_path / "x.json"
    write_json_if_changed(p, {"cases": [{"updated_at": "a"}]})
    assert write_json_if_changed(p, {"cases": [{"updated_at": "b"}]}) is True


def test_load_json_default_for_missing_or_broken(tmp_path):
    from pax.jsonio import load_json
    assert load_json(tmp_path / "none.json", default={}) == {}
    bad = tmp_path / "bad.json"
    bad.write_text("{", encoding="utf-8")
    assert load_json(bad, default=[]) == []
    with pytest.raises(FileNotFoundError):
        load_json(tmp_path / "none.json")


def test_compact_write_and_custom_volatile_keys(tmp_path):
    from pax.jsonio import write_json_if_changed
    p = tmp_path / "evals-lite.json"
    assert write_json_if_changed(p, {"evaluated_at": "a", "cases": [1]}, compact=True,
                                 volatile=("evaluated_at",)) is True
    assert p.read_text(encoding="utf-8") == '{"evaluated_at":"a","cases":[1]}\n'
    assert write_json_if_changed(p, {"evaluated_at": "b", "cases": [1]}, compact=True,
                                 volatile=("evaluated_at",)) is False
