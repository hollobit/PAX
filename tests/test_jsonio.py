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
