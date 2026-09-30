"""site/city3d/README.md의 도시별 표(자료 수·이름표 수·랜드마크)를 빌드 산출물에서 다시 쓴다.

    python3 scripts/city3d/readme_tables.py

표는 README의 <!-- table:NAME --> … <!-- /table:NAME --> 사이만 바꾼다. 경기 시·군은 합계 한 줄과 시·군별 접은 표로 싣는다.
"""
import json
import re
import sys
from pathlib import Path

from common import CITIES, OUT, REPO  # noqa: E402

README = REPO / "site" / "city3d" / "README.md"
fmt = "{:,}".format


def metas():
    for c in CITIES:
        mp = OUT / c["key"] / "meta.json"
        if mp.exists():
            yield c, json.loads(mp.read_text()), json.loads((OUT / c["key"] / "mapinfo.json").read_text())


def counts_row(name, cs, terr, mb):
    b, e = cs["buildings"], cs["estimated_height"]
    return (f"| {name} | {fmt(b)} | {fmt(e)} ({round(e / b * 100) if b else 0}%) | {cs['corrected_height']} | {fmt(cs['roads'])} | "
            f"{fmt(cs['waterways'])} | {fmt(cs['water_triangles'])} | {fmt(cs['green_triangles'])} | {terr} | {mb:.1f} MB |")


def table_counts(rows):
    head = ["| 도시 | 건물 | 높이 추정 | 높이 보정 | 도로·철도 선 | 하천 선 | 수면 삼각형 | 숲·공원 삼각형 | 표고 격자·범위 | 파일 합계 |",
            "|---|---|---|---|---|---|---|---|---|---|"]
    main, gg, tot = [], [], {k: 0 for k in ("buildings", "estimated_height", "corrected_height", "roads", "waterways", "water_triangles", "green_triangles")}
    ggtot = dict.fromkeys(tot, 0)
    mb_all = mb_gg = 0.0
    for c, m, _ in rows:
        t = m["terrain"]
        mb = sum(v["bytes"] for v in m["files"].values()) / 1048576
        terr = f"{t['cols']}×{t['rows']} · {round(t['min_m'])}~{round(t['max_m'])} m"
        line = counts_row(c["name"], m["counts"], terr, mb)
        for k in tot:
            tot[k] += m["counts"][k]
        mb_all += mb
        if c.get("group") == "경기":
            gg.append(line)
            for k in ggtot:
                ggtot[k] += m["counts"][k]
            mb_gg += mb
        else:
            main.append(line)
    if gg:
        main.append(counts_row(f"경기 {len(gg)}개 시·군 합", ggtot, "시·군별", mb_gg))
    main.append(counts_row("**합계**", tot, "", mb_all))
    out = head + main
    if gg:
        out += ["", "<details><summary>경기 시·군별</summary>", "", *head, *gg, "", "</details>"]
    return out


def table_labels(rows):
    kinds = ["district", "quarter", "station", "road", "peak", "water", "gov", "hospital", "school", "landmark"]
    head = ["| 도시 | 구·군 | 동네 | 역 | 도로 | 산 | 물 | 관공서 | 병원 | 학교 | 명소 | 계 |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    main, gg = [], []
    for c, _, info in rows:
        k = info["counts"]
        line = f"| {c['name']} | " + " | ".join(str(k.get(x, 0)) for x in kinds) + f" | {fmt(len(info['labels']))} |"
        (gg if c.get("group") == "경기" else main).append(line)
    out = head + main
    if gg:
        out += ["", "<details><summary>경기 시·군별</summary>", "", *head, *gg, "", "</details>"]
    return out


def table_landmarks(rows):
    head = ["| 도시 | 비행 | OSM에서 확인된 랜드마크 | 대략 좌표(날지 않음) |", "|---|---|---|---|"]
    main, gg = [], []
    for c, m, _ in rows:
        ok = [l["name"] for l in m["landmarks"] if l["source"] == "OSM POI"]
        bad = [l["name"] for l in m["landmarks"] if l["source"] != "OSM POI"]
        line = f"| {c['name']} | {len(ok)} | {' · '.join(ok) or '—'} | {' · '.join(bad) or '—'} |"
        (gg if c.get("group") == "경기" else main).append(line)
    out = head + main
    if gg:
        out += ["", "<details><summary>경기 시·군별</summary>", "", *head, *gg, "", "</details>"]
    return out


def main():
    rows = list(metas())
    text = README.read_text()
    for name, fn in (("counts", table_counts), ("labels", table_labels), ("landmarks", table_landmarks)):
        body = "\n".join(fn(rows))
        pat = re.compile(rf"<!-- table:{name} -->.*?<!-- /table:{name} -->", re.S)
        if not pat.search(text):
            raise SystemExit(f"README에 <!-- table:{name} --> 표시가 없습니다")
        text = pat.sub(f"<!-- table:{name} -->\n{body}\n<!-- /table:{name} -->", text)
    README.write_text(text)
    print(f"README 표 갱신: 도시 {len(rows)}곳")


if __name__ == "__main__":
    main()
