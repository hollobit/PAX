#!/usr/bin/env python3
"""『모두의 공공AX 디자인 패턴』(PAX-DP)의 패턴 카탈로그와 사례별 태깅을 이 저장소로 가져온다.

원본은 별도 작업 저장소(NIA-PubAX)의 `docs/pattern_directory/*.json`(패턴 107종)과
`evaluations_pattern_pax/<case id>.json`(사례별 태깅)이다. 공개 사이트에 싣는 것만 골라
`data/patterns/catalog.json`·`data/patterns/case_patterns.json`으로 쓴다 — 사례 상세 페이지가 읽는다.

빼는 것: 원문 인용(evidence)·카탈로그 피드백(catalogue_feedback)·내부 출처 표기(sources)·예시(examples).
판정 근거(rationale)는 익명화 게이트(직접 인용부호·연락처·닉네임)를 통과한 것만 싣는다 — 길이 제한은 요약용이라 뺀다.
패턴마다 웹북의 해당 절 주소(장 파일#p-<id>)를 붙인다.

    python3 scripts/sync_patterns.py --src ~/git/NIA-PubAX
    python3 scripts/sync_patterns.py --src ~/git/NIA-PubAX --book-dir <웹북 HTML 폴더>   # 내려받기 대신 로컬
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from pax.jsonio import write_json
from pax.privacy import find_privacy_issues

BOOK_URL = "https://hollobit.github.io/PAX-DP/"
BOOK_RAW = "https://raw.githubusercontent.com/hollobit/PAX-DP/gh-pages/"
BOOK_PAGES = [f"ch{n:02d}.html" for n in range(5, 15)]
OUT = Path("data/patterns")

CATALOG_FIELDS = ("id", "name", "aka", "layer", "summary", "motivation", "solution", "when_to_use", "when_not_to_use",
                  "consequences", "environment", "ax_implication", "transition_scope", "dependencies", "related",
                  "anti_patterns", "threat", "assurance", "resources")
CASE_FIELDS = ("workflow", "control_flow", "platform", "platform_planned", "operational", "security", "interaction",
               "blocks", "service_type", "transition", "wiring", "anti_patterns", "reference_candidate",
               "missing_required", "catalogue_version")
ANCHOR = re.compile(r'id="p-([^"]+)"')


def anchor_to_id(anchor: str) -> str:
    """웹북 앵커(p-Bp1, p-A2_5, p-Bpm) → 패턴 id(B′1, A2.5, B′+)."""
    if anchor == "Bpm":
        return "B′+"
    return anchor.replace("p", "′", 1).replace("_", ".") if re.match(r"^Bp", anchor) else anchor.replace("_", ".")


def _split_ids(value):
    """태깅 원본에 'S5|S6'처럼 붙어 들어간 id를 나눈다(목록 필드만)."""
    if isinstance(value, list):
        return [part.strip() for v in value for part in (v.split("|") if isinstance(v, str) else [v]) if part]
    if isinstance(value, dict):
        return {k: _split_ids(v) if isinstance(v, list) else v for k, v in value.items()}
    return value


def anchor_map(pages: dict[str, str]) -> dict[str, str]:
    out = {}
    for name, html in pages.items():
        for a in ANCHOR.findall(html):
            out.setdefault(anchor_to_id(a), f"{name}#p-{a}")
    return out


def _clean(value):
    """빈 값은 뺀다(None·빈 목록·빈 문자열)."""
    return value not in (None, "", [], {})


def catalog_entry(item: dict, anchors: dict[str, str], book_url: str) -> dict:
    out = {k: item[k] for k in CATALOG_FIELDS if _clean(item.get(k))}
    usage = item.get("usage") or {}
    if usage:
        out["usage"] = {k: usage[k] for k in ("steps", "checklist", "wiring_example") if _clean(usage.get(k))}
    if item.get("id") in anchors:
        out["url"] = book_url + anchors[item["id"]]
    return out


def public_text(text: str) -> bool:
    return not [i for i in find_privacy_issues({"summary": text}) if "길이" not in i]


def case_entry(raw: dict) -> dict:
    out = {k: _split_ids(raw[k]) for k in CASE_FIELDS if k in raw}
    rationale = (raw.get("rationale") or "").strip()
    if rationale and public_text(rationale):
        out["rationale"] = rationale
    return out


def load_book_pages(book_dir: str | None) -> dict[str, str]:
    pages = {}
    for name in BOOK_PAGES:
        if book_dir:
            p = Path(book_dir) / name
            pages[name] = p.read_text(encoding="utf-8") if p.exists() else ""
        else:
            r = subprocess.run(["curl", "-sfL", "-m", "60", BOOK_RAW + name], capture_output=True, text=True)
            pages[name] = r.stdout if r.returncode == 0 else ""
    return pages


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="NIA-PubAX 저장소 경로")
    ap.add_argument("--book-dir", help="웹북 HTML이 있는 폴더(없으면 GitHub에서 내려받음)")
    args = ap.parse_args(argv)
    src = Path(args.src).expanduser()
    directory = sorted((src / "docs" / "pattern_directory").glob("*.json"))
    tagging = sorted((src / "evaluations_pattern_pax").glob("*.json"))
    if not directory or not tagging:
        print(f"오류: {src}에서 pattern_directory 또는 evaluations_pattern_pax를 찾지 못했습니다", file=sys.stderr)
        return 1
    anchors = anchor_map(load_book_pages(args.book_dir))
    patterns = {}
    for f in directory:
        doc = json.loads(f.read_text(encoding="utf-8"))
        for item in doc if isinstance(doc, list) else doc.get("items") or doc.get("patterns") or []:
            patterns[item["id"]] = catalog_entry(item, anchors, BOOK_URL)
    cases, dropped = {}, 0
    for f in tagging:
        raw = json.loads(f.read_text(encoding="utf-8"))
        entry = case_entry(raw)
        dropped += 0 if "rationale" in entry or not raw.get("rationale") else 1
        cases[raw["id"]] = entry
    write_json(OUT / "catalog.json", {"version": "v0.7.1", "book_url": BOOK_URL, "patterns": patterns})
    write_json(OUT / "case_patterns.json", {"cases": cases}, compact=True)
    linked = sum(1 for p in patterns.values() if "url" in p)
    print(f"{OUT}/ ← 패턴 {len(patterns)}종(웹북 연결 {linked}) · 사례 태깅 {len(cases)}건 (판정 근거 비공개 {dropped}건)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
