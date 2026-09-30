"""원장 JSON 읽기·쓰기 — 형식을 한 곳에서 정한다.

data/cases.json을 merge(2칸)·tag_licenses·check_health(1칸, 끝 줄바꿈 없음)가 서로 다른 형식으로
쓰던 탓에, 사례 한 건만 늘어도 원장 diff가 파일 전체로 번졌다. 원장을 쓰는 코드는 이 함수를 쓴다.
형식: 한 칸 들여쓰기 · 한글 그대로(ensure_ascii=False) · 키 순서 보존 · 끝 줄바꿈.
임시 파일에 다 쓴 뒤 교체하므로, 도중에 실패해도 기존 파일은 온전하다.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

INDENT = 1


def read_json(path: Path | str) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=INDENT) + "\n"


def write_json(path: Path | str, obj: Any) -> None:
    path = Path(path)
    text = dumps(obj)  # 직렬화 실패는 파일을 건드리기 전에 난다
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
