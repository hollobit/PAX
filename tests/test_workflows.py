"""GitHub Actions 워크플로가 YAML로 읽히고 이름이 있는지 — 깨지면 실행 이름이 파일 경로로 바뀌고 CI·배포가 통째로 멈춘다
(2026-10-08: run 값에 '콜론+공백'이 따옴표 없이 들어가 CI가 실패, 배포가 멈춘 일이 있었다)."""
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")
WORKFLOWS = sorted((Path(__file__).resolve().parent.parent / ".github" / "workflows").glob("*.yml"))


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_workflow_parses_and_is_named(path):
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(doc, dict) and doc.get("name"), path.name
    assert doc.get("jobs"), path.name
