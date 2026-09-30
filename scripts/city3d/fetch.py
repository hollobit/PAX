"""원자료 받기 — 도시 경계에 걸치는 OpenFreeMap z14 벡터 타일과 AWS Terrain Tiles(Terrarium) z13.

이미 받은 타일은 cache/에서 다시 쓴다(재실행 시 요청 0). 동시 요청 6개.
    uv run --with shapely python3 scripts/city3d/fetch.py
"""
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, box

from common import CACHE, CITIES, DEM_URL, DEM_Z, MVT_Z, TILEJSON, UA, city_boundary, tile_lonlat, tile_xy  # noqa: E402


def get(url, dest, tries=4):
    if dest.exists() and dest.stat().st_size > 0:
        return "cached"
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            dest.write_bytes(data)
            return "ok"
        except Exception as e:  # noqa: BLE001 — 재시도 후 보고
            if getattr(e, "code", None) == 404:
                dest.write_bytes(b"")
                return "404"
            time.sleep(1.5 * (i + 1))
    return "fail"


def tiles_for(poly, z):
    lon_min, lat_min, lon_max, lat_max = poly.bounds
    x0, y0 = (int(v) for v in tile_xy(lon_min, lat_max, z))
    x1, y1 = (int(v) for v in tile_xy(lon_max, lat_min, z))
    out = []
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            w, n = tile_lonlat(x, y, z)
            e, s = tile_lonlat(x + 1, y + 1, z)
            if poly.intersects(box(w, s, e, n)):
                out.append((x, y))
    return out


def main():
    """python3 scripts/city3d/fetch.py [--refresh] [도시 key…]

    기본은 이미 받은 스냅샷(cache/snapshot.txt)에 고정한다 — 도시 하나를 더할 때 다른 날짜 자료가 섞이지 않게.
    --refresh면 OpenFreeMap 최신 스냅샷으로 바꾼다(그때는 모든 도시를 다시 받고 다시 가공해야 한다).
    """
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    latest = json.loads(urllib.request.urlopen(urllib.request.Request(TILEJSON, headers={"User-Agent": UA})).read())["tiles"][0]
    pinned = CACHE / "snapshot.txt"
    if pinned.exists() and "--refresh" not in sys.argv:
        snapshot = pinned.read_text().strip()
        template = re.sub(r"/planet/[^/]+/", f"/planet/{snapshot}/", latest)
    else:
        template = latest
        snapshot = template.split("/planet/")[1].split("/")[0]
        CACHE.mkdir(parents=True, exist_ok=True)
        pinned.write_text(snapshot)
    report_path = CACHE / "fetch-report.json"
    report = json.loads(report_path.read_text())["cities"] if report_path.exists() else {}
    for city in CITIES:
        if args and city["key"] not in args:
            continue
        polys = city_boundary(city)
        geom = MultiPolygon([Polygon(p[0], p[1:]) for p in polys]).buffer(0.002)
        mvt = tiles_for(geom, MVT_Z)
        dem = tiles_for(geom, DEM_Z)
        mdir = CACHE / "mvt" / city["key"]
        ddir = CACHE / "dem" / city["key"]
        mdir.mkdir(parents=True, exist_ok=True)
        ddir.mkdir(parents=True, exist_ok=True)
        jobs = [(template.replace("{z}", str(MVT_Z)).replace("{x}", str(x)).replace("{y}", str(y)), mdir / f"{x}_{y}.pbf") for x, y in mvt]
        jobs += [(DEM_URL.format(z=DEM_Z, x=x, y=y), ddir / f"{x}_{y}.png") for x, y in dem]
        with ThreadPoolExecutor(6) as ex:
            results = list(ex.map(lambda j: get(*j), jobs))
        counts = {k: results.count(k) for k in set(results)}
        report[city["key"]] = {"mvt_tiles": len(mvt), "dem_tiles": len(dem), "results": counts}
        print(city["key"], report[city["key"]], flush=True)
    report_path.write_text(json.dumps({"snapshot": snapshot, "cities": report}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
