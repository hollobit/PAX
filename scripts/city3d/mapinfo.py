"""실제 지도 정보(이름·행정 경계)를 3D 장면과 같은 로컬 좌표로 옮긴다 → site/data/<city>/mapinfo.json

  uv run --with mapbox-vector-tile --with shapely python3 scripts/city3d/mapinfo.py [city…]

- 구·군 경계와 이름: SGIS 경계(PAX 저장소 korea-sgg.json, CC BY 4.0). 세종처럼 구가 없는 도시는 시 하나.
- 이름표: OpenFreeMap 타일(OpenMapTiles 형식)의 place·poi·transportation_name·water_name·mountain_peak·
  aerodrome_label 레이어. 타일 여백에 같은 지물이 겹쳐 들어오므로 (종류, 이름, 150m 격자)로 중복을 없앤다.
- 모든 좌표는 meta.json의 frame(원점 = 남서 모서리, x 동쪽·n 북쪽 m)을 그대로 쓴다 — 3D와 2D 지도가 같은 수로 맞물린다.
"""
import json
import math
import re
import sys
from pathlib import Path

import mapbox_vector_tile as mvt
import shapely
from shapely.geometry import LineString, MultiPolygon, Polygon, shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, CITIES, OUT, PAX_DATA, Frame  # noqa: E402

EXTENT = 4096
HANGUL = re.compile("[가-힣]")

# 종류 → (레이어 규칙, 표시 우선순위: 작을수록 먼저). 무엇을 뽑는지는 README에 같은 표로 적는다.
# (class, subclass) → 종류. 주민센터(townhall)는 넣고 복지관 등(community_centre)·전망대·기념비는 뺀다.
POI_KIND = {
    ("town_hall", "townhall"): "gov", ("office", "government"): "gov",  # 시청·구청·정부청사는 office/government ("town_hall", "courthouse"): "gov", ("town_hall", "public_building"): "gov",
    ("hospital", "hospital"): "hospital", ("college", "university"): "school", ("college", "college"): "school",
    ("stadium", "stadium"): "landmark", ("museum", "museum"): "landmark", ("castle", "castle"): "landmark",
    ("castle", "ruins"): "landmark", ("attraction", "attraction"): "landmark",
}
# 물 이름: 작은 연못·분수를 빼려고 끝말이 물길·호수인 것만
WATER_SUFFIX = ("강", "천", "호", "호수", "저수지", "댐", "만", "바다", "해", "하구", "내")
# 같은 이름을 다시 붙이는 최소 거리(m) — 역은 출입구·승강장마다 점이 있어 한 번만
SPREAD = {"road": 1500, "river": 2500, "station": 700}
PLACE_KIND = {"city": "city", "town": "city", "suburb": "quarter", "quarter": "quarter", "neighbourhood": "quarter", "village": "quarter"}
ROAD_CLASSES = {"motorway", "trunk", "primary", "secondary"}
KIND_RANK = {"district": 0, "city": 0, "airport": 1, "peak": 2, "station": 2, "water": 3, "gov": 3,
             "landmark": 4, "road": 4, "quarter": 5, "hospital": 6, "school": 6}


def tile_conv(x, y, frame, z=14):
    from common import tile_lonlat

    def f(px, py):
        lon, lat = tile_lonlat(x + px / EXTENT, y + py / EXTENT, z)
        return frame.to_local(lon, lat)
    return f


def name_of(p):
    return p.get("name:ko") or p.get("name")


def districts(city, frame):
    sgg = json.loads((PAX_DATA / "korea-sgg.json").read_text())["sgg"]
    if "sgg" in city:
        region, name = city["sgg"]
        rows = [s for s in sgg if s["region"] == region and s["name"] == name]
    else:
        rows = [s for s in sgg if s["region"] == city["region"] and s["name"] not in city.get("exclude_sgg", [])]
    out = []
    for s in rows:
        polys = []
        for p in s["polys"]:
            ring = [frame.to_local(lon, lat) for lon, lat in p[0]]
            poly = Polygon(ring).buffer(0).simplify(12)
            for part in getattr(poly, "geoms", [poly]):
                if part.area > 20000:
                    polys.append([[round(a, 1), round(b, 1)] for a, b in part.exterior.coords])
        geom = MultiPolygon([Polygon(p) for p in polys]).buffer(0)
        c = geom.representative_point() if not geom.is_empty else None
        if not polys or c is None:
            continue
        out.append({"name": s["name"], "x": round(c.x, 1), "n": round(c.y, 1), "polys": polys,
                    "area_km2": round(geom.area / 1e6, 2)})
    return out


def labels(city, frame, inside):
    seen = {}
    line_pts = {}
    water_pts = []  # 물 이름 점 — 물길 선 이름과 같은 간격 규칙(SPREAD["river"])을 쓰도록 선 다음에 넣는다

    spread = {}

    def spaced(kind, name, x, n):
        kept = spread.setdefault((kind, name), [])
        if any((x - a) ** 2 + (n - b) ** 2 < SPREAD[kind] ** 2 for a, b in kept):
            return False
        kept.append((x, n))
        return True

    def add(kind, name, x, n, extra=None):
        if not name or not (0 <= x <= frame.width and 0 <= n <= frame.height) or not inside(x, n):
            return
        key = (kind, name, round(x / 150), round(n / 150))
        if key in seen:
            return
        seen[key] = {"k": kind, "name": name, "x": round(x, 1), "n": round(n, 1), **(extra or {})}

    for f in sorted((CACHE / "mvt" / city["key"]).glob("*.pbf")):
        raw = f.read_bytes()
        if not raw:
            continue
        tx, ty = (int(v) for v in f.stem.split("_"))
        conv = tile_conv(tx, ty, frame)
        L = mvt.decode(raw, default_options={"y_coord_down": True})

        def pts(layer):
            for ft in L.get(layer, {}).get("features", []):
                g = ft["geometry"]
                if g["type"] != "Point":
                    continue
                px, py = g["coordinates"]
                if 0 <= px < EXTENT and 0 <= py < EXTENT:  # 여백 중복: 제 타일 안의 점만
                    yield ft["properties"], conv(px, py)

        for p, (x, n) in pts("place"):
            kind = PLACE_KIND.get(p.get("class"))
            if kind:
                add(kind, name_of(p), x, n, {"rank": p.get("rank")})
        for p, (x, n) in pts("mountain_peak"):
            if p.get("ele"):
                add("peak", name_of(p), x, n, {"ele": p.get("ele")})
        for p, (x, n) in pts("aerodrome_label"):
            add("airport", name_of(p), x, n)
        for p, (x, n) in pts("water_name"):
            nm = name_of(p)
            if nm and nm.endswith(WATER_SUFFIX) and "연못" not in nm:
                water_pts.append((nm, x, n))
        for p, (x, n) in pts("poi"):
            cls, sub = p.get("class"), p.get("subclass")
            if cls == "railway" and sub in ("station", "subway", "halt"):
                nm = name_of(p)
                nm = nm if not nm or nm.endswith("역") else f"{nm}역"
                if nm and spaced("station", nm, x, n):
                    add("station", nm, x, n)
            elif (cls, sub) in POI_KIND:
                nm = name_of(p)
                if POI_KIND[(cls, sub)] == "hospital" and not (nm and ("병원" in nm or "의료원" in nm)):
                    continue
                if POI_KIND[(cls, sub)] == "landmark" and not (nm and HANGUL.search(nm) and "(" not in nm):
                    continue  # 영문만 있는 이름·괄호 설명이 붙은 이름은 뺀다
                add(POI_KIND[(cls, sub)], nm, x, n)
        # 길·강 이름: 선의 가운데 점. 같은 이름은 SPREAD 이상 떨어진 곳에만 다시 붙인다(긴 선부터)
        for layer, kind in (("transportation_name", "road"), ("waterway", "river")):
            for ft in L.get(layer, {}).get("features", []):
                p = ft["properties"]
                nm = name_of(p)
                if not nm:
                    continue
                if kind == "road" and (p.get("class") not in ROAD_CLASSES or p.get("subclass") == "junction"):
                    continue
                if kind == "river" and (p.get("class") not in ("river", "canal", "stream") or p.get("brunnel") == "tunnel"):
                    continue
                for line in _lines(shapely.clip_by_rect(shape(ft["geometry"]), 0, 0, EXTENT, EXTENT)):
                    if line.length < 400:
                        continue
                    x, n = conv(*line.interpolate(0.5, normalized=True).coords[0])
                    line_pts.setdefault((kind, nm), []).append((line.length, x, n, p.get("class")))

    for (kind, nm), cand in line_pts.items():
        for _, x, n, cls in sorted(cand, reverse=True):
            if spaced(kind, nm, x, n):
                add("water" if kind == "river" else "road", nm, x, n, {"cls": cls})
    for nm, x, n in water_pts:
        if spaced("river", nm, x, n):
            add("water", nm, x, n)
    rows = sorted(seen.values(), key=lambda r: (KIND_RANK[r["k"]], r.get("rank") or 0, r["name"]))
    return rows


def _lines(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    return [x for x in getattr(g, "geoms", []) if isinstance(x, LineString)]


def build(city):
    meta = json.loads((OUT / city["key"] / "meta.json").read_text())
    fm = meta["frame"]
    frame = Frame(fm["lon0"], fm["lat0"], fm["lon1"], fm["lat1"])
    ds = districts(city, frame)
    area = shapely.union_all([Polygon(p) for d in ds for p in d["polys"]]).buffer(300)
    shapely.prepare(area)
    lbl = labels(city, frame, lambda x, n: shapely.contains_xy(area, x, n))
    info = {
        "key": city["key"], "snapshot": meta["snapshot"],
        "districts": ds, "labels": lbl,
        "counts": {k: sum(1 for r in lbl if r["k"] == k) for k in KIND_RANK} | {"district": len(ds)},
        "sources": {
            "districts": "통계청 SGIS 행정동 경계를 vuski/admdongkor가 가공(CC BY 4.0) → 시군구 병합·12m 단순화",
            "labels": "OpenFreeMap 벡터 타일(OpenMapTiles) place·poi·transportation_name·water_name·mountain_peak·aerodrome_label, © OpenStreetMap contributors, ODbL 1.0",
        },
    }
    path = OUT / city["key"] / "mapinfo.json"
    path.write_text(json.dumps(info, ensure_ascii=False, separators=(",", ":")))
    print(city["key"], path.stat().st_size, info["counts"], flush=True)


if __name__ == "__main__":
    only = sys.argv[1:] or [c["key"] for c in CITIES]
    for c in CITIES:
        if c["key"] in only:
            build(c)
