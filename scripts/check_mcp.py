#!/usr/bin/env python3
"""MCP 사례 자동 보안 검사 — 축 1(권한 표면)·2(시크릿)·3(공급망).

사용: PYTHONPATH=scripts python3 scripts/check_mcp.py [--case <id>] [--audit-only]
- 대상: cases.json의 MCP 사례(pax.mcp_review.mcp_targets)
- 결과: data/mcp_reviews.json에 병합 (LLM 감사 축 injection/data_flow와 disclosure는 보존)
- 악용 가능 상세(파일·매치 위치)는 data/private/mcp_findings/<case_id>.md 에만 기록
- 침묵 통과 금지: 클론 실패·도구 부재는 "미검증(사유)"로 남긴다
"""
import argparse
import datetime
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pax.mcp_review import load_reviews, mcp_targets, save_reviews  # noqa: E402

LEDGER = Path("data/mcp_reviews.json")
PRIVATE_DIR = Path("data/private/mcp_findings")
SOURCE_EXT = {".py", ".js", ".ts", ".mjs", ".cjs", ".tsx"}
SKIP_DIRS = {"node_modules", ".git", "dist", "build", "venv", ".venv"}

RISK_PATTERNS = {
    "shell": re.compile(r"subprocess|child_process|execSync|os\.system|shell=True"),
    "fs_write": re.compile(r"open\([^)]*['\"]w|writeFile|fs\.write|shutil\.rmtree"),
    "network": re.compile(r"requests\.|fetch\(|axios|urllib|httpx"),
}
SECRET_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"sk-[A-Za-z0-9]{32,}"),
    re.compile(r"ghp_[A-Za-z0-9]{36}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
]
PLACEHOLDER = re.compile(r"YOUR_|EXAMPLE|<[A-Z_]+>|xxxx|CHANGE_?ME", re.I)


def iter_source_files(repo_dir: Path):
    for f in sorted(Path(repo_dir).rglob("*")):
        if not f.is_file() or f.suffix not in SOURCE_EXT:
            continue
        if any(part in SKIP_DIRS for part in f.parts):
            continue
        yield f


def scan_permission_surface(repo_dir: Path) -> dict:
    """축 1 — 위험 호출 패턴 빈도로 권한 표면을 본다. 정밀 분석은 LLM 감사(축 4)가 보완."""
    counts = {k: 0 for k in RISK_PATTERNS}
    for f in iter_source_files(repo_dir):
        text = f.read_text(errors="ignore")
        for k, pat in RISK_PATTERNS.items():
            counts[k] += len(pat.findall(text))
    if counts["shell"]:
        return {"verdict": "주의",
                "note": f"셸 실행 패턴 {counts['shell']}건 — 도구 목적 대비 필요성 검토 권장",
                "counts": counts}
    if counts["fs_write"]:
        return {"verdict": "주의",
                "note": f"파일 쓰기 패턴 {counts['fs_write']}건 — 쓰기 범위 확인 권장",
                "counts": counts}
    return {"verdict": "통과", "note": "셸·파일 쓰기 패턴 없음(네트워크 조회 중심)", "counts": counts}


def scan_secrets(repo_dir: Path, private_dir: Path | None, case_id: str = "") -> dict:
    """축 2 — 자격증명 패턴. 공개 note에는 종류·개수도 아닌 존재 사실만 남긴다."""
    findings = []
    env_committed = any(f.name == ".env" for f in Path(repo_dir).rglob(".env")
                        if not any(p in SKIP_DIRS for p in f.parts))
    for f in iter_source_files(repo_dir):
        text = f.read_text(errors="ignore")
        for pat in SECRET_PATTERNS:
            for m in pat.finditer(text):
                line = text[:m.start()].count("\n") + 1
                context = text.splitlines()[line - 1][:120]
                if PLACEHOLDER.search(context):
                    continue
                findings.append((str(f.relative_to(repo_dir)), line))
    if findings:
        if private_dir:
            private_dir = Path(private_dir)
            private_dir.mkdir(parents=True, exist_ok=True)
            detail = "\n".join(f"- {path}:{line}" for path, line in findings)
            (private_dir / f"{case_id}.md").write_text(
                f"# 시크릿 스캔 상세 (비공개) — {case_id}\n\n{detail}\n", encoding="utf-8")
        return {"verdict": "심각(비공개 처리 중)",
                "note": "자격증명 패턴 발견 — 상세 비공개, 개발자 통보 절차 대상"}
    if env_committed:
        return {"verdict": "주의", "note": ".env 파일이 저장소에 포함됨 — 내용 확인 권장"}
    return {"verdict": "통과", "note": "하드코딩 자격증명 패턴 없음"}


def scan_supply_chain(repo_dir: Path) -> dict:
    """축 3 — 생태계별 의존성 감사. 도구 부재는 미검증으로(침묵 통과 금지)."""
    repo_dir = Path(repo_dir)
    has_npm = (repo_dir / "package.json").exists()
    has_py = any((repo_dir / f).exists() for f in ("requirements.txt", "pyproject.toml"))
    if not has_npm and not has_py:
        return {"verdict": "해당 없음", "note": "npm·python 의존성 선언 없음"}
    notes, worst = [], "통과"
    try:
        if has_npm:
            lock = (repo_dir / "package-lock.json").exists()
            r = subprocess.run(["npm", "audit", "--json"], cwd=repo_dir,
                               capture_output=True, text=True, timeout=120)
            vulns = json.loads(r.stdout or "{}").get("metadata", {}).get("vulnerabilities", {})
            high_plus = int(vulns.get("critical", 0)) + int(vulns.get("high", 0))
            if high_plus:
                notes.append(f"High 이상 CVE {high_plus}건")
                worst = "주의"
            if not lock:
                notes.append("락파일 없음(버전 미고정)")
                worst = "주의"
        if has_py:
            req = repo_dir / "requirements.txt"
            if req.exists():
                r = subprocess.run(["pip-audit", "-r", str(req), "--format", "json"],
                                   cwd=repo_dir, capture_output=True, text=True, timeout=180)
                deps = json.loads(r.stdout or "[]")
                n = sum(len(d.get("vulns", [])) for d in (deps if isinstance(deps, list)
                                                          else deps.get("dependencies", [])))
                if n:
                    notes.append(f"python 취약 의존성 {n}건")
                    worst = "주의"
    except FileNotFoundError as e:
        return {"verdict": "미검증", "note": f"감사 도구 없음({e})"}
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        return {"verdict": "미검증", "note": f"감사 실패({type(e).__name__})"}
    return {"verdict": worst, "note": " · ".join(notes) or "알려진 High 이상 CVE 없음"}


def merge_review(ledger: dict, case_id: str, new_axes: dict, checked_at: str, tools: dict):
    """자동 축 결과를 병합 — LLM 감사 축·disclosure·dynamic은 건드리지 않는다."""
    review = next((r for r in ledger["reviews"] if r["case_id"] == case_id), None)
    if review is None:
        review = {"case_id": case_id, "axes": {}, "disclosure": None}
        ledger["reviews"].append(review)
    review["axes"].update(new_axes)
    review["checked_at"] = checked_at
    review.setdefault("tools", {}).update(tools)
    return review


def hygiene_axis(case: dict) -> dict:
    """축 6 — 기존 관측 필드에서 자동 도출."""
    lic = case.get("license")
    maint = case.get("maintenance")
    if lic and lic != "명시 없음" and maint == "활발":
        return {"verdict": "통과", "note": f"{lic}·{maint}"}
    if maint == "방치" or not lic or lic == "명시 없음":
        parts = []
        if not lic or lic == "명시 없음":
            parts.append("라이선스 명시 없음")
        if maint == "방치":
            parts.append("유지보수 방치")
        return {"verdict": "주의", "note": " · ".join(parts) or "확인 필요"}
    return {"verdict": "통과", "note": f"{lic or '라이선스 미상'}·{maint or '유지보수 미상'}"}


def tool_versions() -> dict:
    vers = {}
    for name, cmd in (("npm", ["npm", "--version"]), ("pip_audit", ["pip-audit", "--version"])):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            vers[name] = r.stdout.strip().split()[-1]
        except Exception:
            vers[name] = "없음"
    return vers


def check_case(target: dict, case: dict, ledger: dict, today: str, tools: dict,
               audit_only: bool = False):
    repo = target["repo"]
    axes = {}
    if repo is None:
        note = "해당 없음(코드 비공개 — 원격 서비스)"
        axes = {"permission_surface": {"verdict": "해당 없음", "note": note},
                "secrets": {"verdict": "해당 없음", "note": note},
                "supply_chain": {"verdict": "해당 없음", "note": note}}
    else:
        with tempfile.TemporaryDirectory(prefix="mcpchk-") as tmp:
            clone_cmd = ["git", "clone", "--depth", "1", "--quiet"]
            if "gitlab.aigov" in repo:
                clone_cmd = ["git", "-c", "http.sslVerify=false", "clone", "--depth", "1", "--quiet"]
            r = subprocess.run([*clone_cmd, repo, tmp + "/repo"],
                               capture_output=True, text=True, timeout=180)
            if r.returncode != 0:
                note = "미검증(저장소 접근 불가)"
                axes = {k: {"verdict": "미검증", "note": note}
                        for k in ("permission_surface", "secrets", "supply_chain")}
            else:
                repo_dir = Path(tmp) / "repo"
                if audit_only:
                    axes = {"supply_chain": scan_supply_chain(repo_dir)}
                else:
                    axes = {"permission_surface": scan_permission_surface(repo_dir),
                            "secrets": scan_secrets(repo_dir, PRIVATE_DIR, target["case_id"]),
                            "supply_chain": scan_supply_chain(repo_dir)}
    if not audit_only:
        axes["hygiene"] = hygiene_axis(case)
    axes = {k: {kk: vv for kk, vv in v.items() if kk in ("verdict", "note")}
            for k, v in axes.items()}
    merge_review(ledger, target["case_id"], axes, today, tools)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", help="단건 검사할 case id")
    ap.add_argument("--audit-only", action="store_true", help="공급망 축만 재검(주간용)")
    args = ap.parse_args()

    cases = json.loads(Path("data/cases.json").read_text(encoding="utf-8"))["cases"]
    by_id = {c["id"]: c for c in cases}
    targets = mcp_targets(cases)
    if args.case:
        targets = [t for t in targets if t["case_id"] == args.case]
        if not targets:
            print(f"MCP 대상 아님 또는 미존재: {args.case}", file=sys.stderr)
            return 1
    ledger = load_reviews(LEDGER, set(by_id)) if LEDGER.exists() else {"reviews": []}
    today = datetime.date.today().isoformat()
    tools = tool_versions()
    for t in targets:
        check_case(t, by_id[t["case_id"]], ledger, today, tools, args.audit_only)
        r = next(x for x in ledger["reviews"] if x["case_id"] == t["case_id"])
        verdicts = {k: v["verdict"] for k, v in r["axes"].items()}
        print(f"  {t['title'][:40]:40s} {verdicts}")
    save_reviews(LEDGER, ledger)
    print(f"검사 완료 {len(targets)}건 → {LEDGER}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
