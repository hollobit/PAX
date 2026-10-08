"""VWorld 2D 데이터 API에서 국토교통부 건물통합정보(LT_C_BLDGINFO)를 받아 캐시에 둔다.

인증키는 저장소에 두지 않는다 — 환경변수 VWORLD_KEY 또는 ~/.config/pax/vworld.env(VWORLD_KEY=…)에서 읽고,
curl에는 표준 입력 설정(-K -)으로 넘겨 명령 인자·로그에 남지 않게 한다. 응답에 키가 섞여 오면 지우고 저장한다.

도시 경계 상자를 0.02°(약 2km) 칸으로 나눠 경계와 겹치는 칸만, 칸마다 1,000건씩 쪽을 넘겨 받는다.
칸 경계에 걸친 건물은 두 칸에서 모두 오므로 process.py가 id로 한 번만 쓴다.

    python3 scripts/city3d/vworld.py seoul          # 받은 칸은 건너뛴다(이어 받기)
    python3 scripts/city3d/vworld.py seoul --force  # 다시 받기
"""
from __future__ import annotations

import datetime
import json
import os
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, box

from common import CACHE, CITIES, city_boundary

API = "https://api.vworld.kr/req/data"
LAYER = "LT_C_BLDGINFO"          # 건물통합정보(국토교통부 GIS건물통합정보) — 2026-10-08 실측
DOMAIN = "https://hollobit.github.io"
CELL_DEG = 0.02
PAGE_SIZE = 1000
PAUSE_S = 0.15
TRIES = 4


def api_key() -> str:
    key = os.environ.get("VWORLD_KEY", "").strip()
    if not key:
        env = Path.home() / ".config" / "pax" / "vworld.env"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("VWORLD_KEY="):
                    key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("VWORLD_KEY가 없습니다 — 환경변수나 ~/.config/pax/vworld.env에 넣어 주세요(저장소에는 넣지 않는다).")
    return key


def fetch_page(key: str, cell, page: int) -> dict:
    params = {"service": "data", "request": "GetFeature", "data": LAYER, "key": key, "domain": DOMAIN,
              "geomFilter": "BOX({:.6f},{:.6f},{:.6f},{:.6f})".format(*cell), "size": PAGE_SIZE, "page": page,
              "format": "json", "crs": "EPSG:4326", "geometry": "true", "attribute": "true"}
    cfg = (f'url = "{API}?{urllib.parse.urlencode(params)}"\nsilent\nlocation\nmax-time = 120\n'
           f'user-agent = "city3d-build (github.com/hollobit/PAX)"\nreferer = "{DOMAIN}"\n')
    for attempt in range(TRIES):
        r = subprocess.run(["curl", "-K", "-"], input=cfg.encode(), capture_output=True)
        body = r.stdout.replace(key.encode(), b"")
        try:
            resp = json.loads(body)["response"]
        except (ValueError, KeyError):
            resp = None
        if resp and resp.get("status") in ("OK", "NOT_FOUND"):
            return resp
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"VWorld 응답 실패: 칸 {cell} 쪽 {page} — {body[:200]!r}")


def cells_for(city) -> list[tuple]:
    polys = city_boundary(city)
    bound = MultiPolygon([Polygon(p[0], p[1:]) for p in polys]).buffer(0)
    x0, y0, x1, y1 = bound.bounds
    out = []
    nx, ny = int((x1 - x0) / CELL_DEG) + 1, int((y1 - y0) / CELL_DEG) + 1
    for i in range(nx):
        for j in range(ny):
            c = (x0 + i * CELL_DEG, y0 + j * CELL_DEG, x0 + (i + 1) * CELL_DEG, y0 + (j + 1) * CELL_DEG)
            if bound.intersects(box(*c)):
                out.append((i, j, c))
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    city = next((c for c in CITIES if c["key"] == argv[0]), None)
    if city is None:
        sys.exit(f"알 수 없는 도시: {argv[0]}")
    force = "--force" in argv
    key = api_key()
    out_dir = CACHE / "vworld" / city["key"]
    out_dir.mkdir(parents=True, exist_ok=True)
    cells = cells_for(city)
    fetched = skipped = features = requests = 0
    for n, (i, j, cell) in enumerate(cells, 1):
        dest = out_dir / f"{i:03d}_{j:03d}.json"
        if dest.exists() and not force:
            skipped += 1
            continue
        feats, page, pages = [], 1, 1
        while page <= pages:
            resp = fetch_page(key, cell, page)
            requests += 1
            if resp.get("status") == "NOT_FOUND":
                break
            pages = int(resp["page"]["total"])
            feats += resp["result"]["featureCollection"]["features"]
            page += 1
            time.sleep(PAUSE_S)
        tmp = dest.with_suffix(".tmp")
        tmp.write_text(json.dumps({"cell": cell, "features": feats}, ensure_ascii=False), encoding="utf-8")
        tmp.replace(dest)
        fetched += 1
        features += len(feats)
        if n % 20 == 0:
            print(f"  {n}/{len(cells)} 칸 · 건물 {features:,} · 요청 {requests}", flush=True)
    report = {"layer": LAYER, "city": city["key"], "cells": len(cells), "fetched": fetched, "skipped": skipped,
              "features_this_run": features, "requests": requests,
              "fetched_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec="seconds")}
    (out_dir / "_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{city['name']}: 칸 {len(cells)} (새로 {fetched}, 건너뜀 {skipped}) · 건물 {features:,} · 요청 {requests}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
