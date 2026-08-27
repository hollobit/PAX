import json
from pathlib import Path

import pytest

import check_mcp

FIX = Path(__file__).parent / "fixtures"


# ── 축 1: 권한 표면 ──
def test_permission_readonly_passes():
    r = check_mcp.scan_permission_surface(FIX / "mcp_readonly")
    assert r["verdict"] == "통과"


def test_permission_shell_flags():
    r = check_mcp.scan_permission_surface(FIX / "mcp_shell")
    assert r["verdict"] == "주의"
    assert "셸" in r["note"]


# ── 축 2: 시크릿 ──
def test_secrets_found_is_critical_and_masked():
    r = check_mcp.scan_secrets(FIX / "mcp_secrets", private_dir=None)
    assert r["verdict"] == "심각(비공개 처리 중)"
    assert "AKIA" not in r["note"] and "sk-" not in r["note"]


def test_secrets_placeholder_passes():
    r = check_mcp.scan_secrets(FIX / "mcp_placeholder", private_dir=None)
    assert r["verdict"] == "통과"


def test_secrets_detail_written_to_private(tmp_path):
    check_mcp.scan_secrets(FIX / "mcp_secrets", private_dir=tmp_path, case_id="x1")
    detail = (tmp_path / "x1.md").read_text(encoding="utf-8")
    assert "config.py" in detail


# ── 축 3: 공급망 ──
def test_supply_chain_npm_cves(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text("{}")
    (tmp_path / "package-lock.json").write_text("{}")
    def fake_run(cmd, **kw):
        class R: returncode = 1; stdout = json.dumps(
            {"metadata": {"vulnerabilities": {"critical": 1, "high": 2, "moderate": 5}}}); stderr = ""
        return R()
    monkeypatch.setattr(check_mcp.subprocess, "run", fake_run)
    r = check_mcp.scan_supply_chain(tmp_path)
    assert r["verdict"] == "주의"
    assert "3건" in r["note"]


def test_supply_chain_missing_tool(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text("{}")
    def fake_run(cmd, **kw):
        raise FileNotFoundError("npm")
    monkeypatch.setattr(check_mcp.subprocess, "run", fake_run)
    r = check_mcp.scan_supply_chain(tmp_path)
    assert r["verdict"] == "미검증"
    assert "도구" in r["note"]


def test_supply_chain_no_ecosystem(tmp_path):
    r = check_mcp.scan_supply_chain(tmp_path)
    assert r["verdict"] == "해당 없음"


def test_supply_chain_no_lockfile(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text("{}")
    def fake_run(cmd, **kw):
        class R: returncode = 0; stdout = json.dumps(
            {"metadata": {"vulnerabilities": {"critical": 0, "high": 0}}}); stderr = ""
        return R()
    monkeypatch.setattr(check_mcp.subprocess, "run", fake_run)
    r = check_mcp.scan_supply_chain(tmp_path)
    assert r["verdict"] == "주의"
    assert "락파일" in r["note"]


# ── 병합 ──
def test_merge_preserves_llm_axes():
    ledger = {"reviews": [{"case_id": "a", "axes": {
        "injection": {"verdict": "통과", "note": "근거: src/x.py:10"},
        "secrets": {"verdict": "통과", "note": "옛 결과"}},
        "disclosure": {"notified_at": "d", "resolved": False}}]}
    check_mcp.merge_review(ledger, "a", {"secrets": {"verdict": "주의", "note": "새 결과"}},
                           checked_at="2026-08-28", tools={})
    r = ledger["reviews"][0]
    assert r["axes"]["injection"]["note"] == "근거: src/x.py:10"
    assert r["axes"]["secrets"]["note"] == "새 결과"
    assert r["disclosure"]["notified_at"] == "d"
    assert r["checked_at"] == "2026-08-28"
