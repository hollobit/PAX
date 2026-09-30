"""수집 후처리를 한 번에 — 정해진 순서로 병합 뒤 빌드 전부를 돌린다.

    PYTHONPATH=scripts python3 -m pax.run post-collect [--dry-run]

예전에는 절차서(scripts/collect_prompt.md)의 명령 15개 남짓을 세션이 차례로 쳤다. 순서가 문장에만
있어서, 읽는 스크립트가 만드는 스크립트보다 먼저 도는 사고가 났다(새 사례가 한 회차 동안
'평가 데이터 없음'으로 공개). 이제 순서는 POST_COLLECT 한 곳에 있고 tests/test_run.py가 지킨다.

신규 사례 유무로 갈래를 나누지 않는다 — 5-A 단계도 멱등이라(라이선스·썸네일은 이미 있는 것을 건너뜀)
매 회차 전부 돌리는 쪽이 '신규가 있을 때만'을 판단하다 빠뜨리는 것보다 안전하다.
병합(pax.merge)과 changelog·커밋은 판단이 필요해 여기 넣지 않는다.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from pax.jsonio import read_json
from pax.urls import preferred_url

ROOT = Path(__file__).resolve().parents[2]
EVAL_XLSX = "docs/native/PAX_공공AX_70개사례_4축_재평가_2026-08-08.xlsx"  # 평가 고정 원본


@dataclass(frozen=True)
class Step:
    name: str
    argv: tuple[str, ...]  # 첫 항목: scripts/…의 파일 또는 pax.… 모듈
    note: str


POST_COLLECT: tuple[Step, ...] = (
    Step("licenses", ("scripts/tag_licenses.py",), "새 저장소 라이선스 태깅(기존은 건너뜀)"),
    Step("eval_data", ("scripts/build_eval_data.py", EVAL_XLSX), "평가 원본 + 추가분 → evaluations.json"),
    Step("mcp_review", ("scripts/build_mcp_review.py",), "MCP 검증 공개본"),
    Step("thumbs", ("scripts/make_thumbs.sh",), "없는 썸네일만 생성(+WebP)"),
    Step("publish", ("pax.publish",), "사이트 사본·경량판·thumb_v·WebP 짝"),
    Step("champions", ("scripts/build_champions.py",), "챔피언(평가 점수 반영)"),
    Step("case_pages", ("scripts/build_case_pages.py",), "사례 상세 페이지(평가표·MCP 배지)"),
    Step("community_stats", ("scripts/build_community_stats.py",), "대화량·가입자·Threads 관측"),
    Step("videos", ("scripts/build_videos.py",), "공유 동영상"),
    Step("news", ("scripts/build_news.py",), "공유 뉴스"),
    Step("index", ("scripts/build_index.py",), "공공 AX 지수(커뮤니티·챔피언 뒤)"),
    Step("dashboard_history", ("scripts/build_dashboard_history.py",), "현황판 일자별 원장(지수·챔피언 뒤)"),
    Step("sync_nav", ("scripts/sync_nav.py",), "상단 메뉴를 NAV 한 곳에 맞춤(바뀐 페이지만)"),
    Step("stamp_assets", ("scripts/stamp_assets.py",), "JS·CSS 캐시 스탬프(해시가 바뀐 것만)"),
)


def needs_thumbs(cases: list, thumbs_dir: Path) -> bool:
    """대표 주소가 있는데 썸네일이 없는 사례가 하나라도 있으면 True — 없으면 브라우저를 띄우지 않는다."""
    return any(preferred_url(c) and not (Path(thumbs_dir) / f"{c['id']}.jpg").exists() for c in cases)


def plan(thumbs_needed: bool) -> list[Step]:
    return [s for s in POST_COLLECT if s.name != "thumbs" or thumbs_needed]


def command(step: Step) -> list[str]:
    target, *args = step.argv
    if target.endswith(".sh"):
        return ["bash", target, *args]
    if target.endswith(".py"):
        return [sys.executable, target, *args]
    return [sys.executable, "-m", target, *args]


def post_collect(dry_run: bool = False) -> int:
    cases = read_json(ROOT / "data" / "cases.json")["cases"]
    steps = plan(needs_thumbs(cases, ROOT / "site" / "thumbs"))
    env = {**__import__("os").environ, "PYTHONPATH": str(ROOT / "scripts")}
    for i, step in enumerate(steps, 1):
        print(f"[{i}/{len(steps)}] {step.name} — {step.note}", flush=True)
        if dry_run:
            print("    $ " + " ".join(command(step)))
            continue
        result = subprocess.run(command(step), cwd=ROOT, env=env)
        if result.returncode != 0:
            # 뒤 단계는 앞 단계 산출물을 읽는다 — 실패한 채 이어 가면 틀린 값이 공개된다
            print(f"중단: {step.name} 종료 코드 {result.returncode}", file=sys.stderr)
            return result.returncode
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m pax.run")
    ap.add_argument("task", choices=["post-collect"])
    ap.add_argument("--dry-run", action="store_true", help="실행하지 않고 순서만 보인다")
    args = ap.parse_args(argv)
    return post_collect(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
