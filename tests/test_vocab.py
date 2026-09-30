"""사이트의 분류 어휘(site/pax-vocab.js)가 원장 스키마(scripts/pax/schema.py)와 같은지 — 한쪽만 고치면
필터에 없는 분류가 생기거나 원장에 없는 분류로 거르게 된다."""
import json
import subprocess
from pathlib import Path

from pax import schema

SITE = Path(__file__).resolve().parent.parent / "site"


def _js(expr: str):
    js = f"const m = await import(process.argv[1]); console.log(JSON.stringify({expr}));"
    out = subprocess.run(["node", "--input-type=module", "-e", js, (SITE / "pax-vocab.js").as_uri()],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_site_vocab_matches_schema():
    assert set(_js("m.ORG_TYPES")) == set(schema.ORG_TYPES)
    assert set(_js("m.TASK_CATEGORIES")) == set(schema.TASK_CATEGORIES)
    assert set(_js("Object.keys(m.TASK_COLORS)")) == set(schema.TASK_CATEGORIES)


def test_pax3d_task_order_covers_the_same_categories():
    src = (SITE / "pax3d-data.js").read_text(encoding="utf-8")
    start = src.index("export const TASKS = [")
    tasks = json.loads(src[start + len("export const TASKS = "):src.index("];", start) + 1].replace("'", '"'))
    assert set(tasks) == set(schema.TASK_CATEGORIES) and len(tasks) == len(schema.TASK_CATEGORIES)


def test_today_kst_for_exports():
    # 내보내기 파일 이름·머리의 날짜 — 한국 00~09시에도 한국 날짜를 쓴다
    js = """const m = await import(process.argv[1]);
    console.log(JSON.stringify(['2026-09-30T14:59:00Z', '2026-09-30T15:00:00Z', '2026-09-30T23:30:00Z']
      .map((u) => m.todayKst(new Date(u)))));"""
    out = subprocess.run(["node", "--input-type=module", "-e", js, (SITE / "pax-dom.js").as_uri()],
                         capture_output=True, text=True, check=True)
    assert json.loads(out.stdout) == ["2026-09-30", "2026-10-01", "2026-10-01"]
