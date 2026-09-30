"""원장 JSON 읽기·쓰기 — 형식을 한 곳에서 정한다.

data/cases.json을 merge(2칸)·tag_licenses·check_health(1칸, 끝 줄바꿈 없음)가 서로 다른 형식으로
쓰던 탓에, 사례 한 건만 늘어도 원장 diff가 파일 전체로 번졌다. 원장을 쓰는 코드는 이 함수를 쓴다.
형식: 한 칸 들여쓰기 · 한글 그대로(ensure_ascii=False) · 키 순서 보존 · 끝 줄바꿈.
임시 파일에 다 쓴 뒤 교체하므로, 도중에 실패해도 기존 파일은 온전하다.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

INDENT = 1


def read_json(path: Path | str) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dumps(obj: Any, compact: bool = False) -> str:
    """compact=True는 사람이 읽지 않는 경량 산출물용(공백 없는 한 줄)."""
    if compact:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"
    return json.dumps(obj, ensure_ascii=False, indent=INDENT) + "\n"


def write_json(path: Path | str, obj: Any, compact: bool = False) -> None:
    path = Path(path)
    text = dumps(obj, compact)  # 직렬화 실패는 파일을 건드리기 전에 난다
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


# 실행할 때마다 바뀌는 최상위 시각 필드 — 내용이 같은지 비교할 때 빼고 본다
VOLATILE_KEYS = ("updated_at", "generated_at")

_MISSING = object()


def load_json(path: Path | str, default: Any = _MISSING) -> Any:
    """read_json과 같되, default를 주면 파일이 없거나 깨졌을 때 그 값을 돌려준다(경고 출력)."""
    try:
        return read_json(path)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        if default is _MISSING:
            raise
        if not isinstance(e, FileNotFoundError):
            print(f"경고: {path} JSON 파싱 실패 — 기본값 사용 ({e})", file=sys.stderr)
        return default


def _payload(obj: Any, volatile) -> Any:
    if isinstance(obj, dict):
        return {k: v for k, v in obj.items() if k not in volatile}
    return obj


def write_json_if_changed(path: Path | str, obj: Any, compact: bool = False,
                          volatile=VOLATILE_KEYS) -> bool:
    """최상위 시각 필드를 뺀 내용이 파일과 다를 때만 쓴다. 썼으면 True.

    수집 회차마다 시각만 바뀐 산출물이 커밋되면 '변경 없으면 커밋하지 않는다'가 영영 걸리지 않는다.
    """
    path = Path(path)
    try:
        if _payload(read_json(path), volatile) == _payload(obj, volatile):
            return False
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    write_json(path, obj, compact)
    return True
