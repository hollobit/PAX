"""벡터 타일·표고 타일 → 도시별 압축 바이너리.

출력(site/data/<city>/):
  buildings.bin  BLDG  16바이트 레코드 × N  (아래 BLDG 참고)
  roads.bin      LINE  가변 길이 폴리라인(도로·철도)
  water.bin      MESH  수면 삼각형(바다·강·호수)
  waterways.bin  LINE  하천 중심선
  green.bin      MESH  숲·공원 삼각형(가르기 표시용 class 바이트 포함)
  terrain.bin    DEMG  표고 격자 int16(0.25m)
  meta.json      좌표계·레코드 수·파일 크기·CRC·출처·스냅샷·랜드마크

    uv run --with mapbox-vector-tile --with shapely --with numpy --with mapbox-earcut --with pillow python3 scripts/city3d/process.py
"""
import io
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import mapbox_earcut as earcut
import mapbox_vector_tile as mvt
import numpy as np
import shapely
from PIL import Image
from shapely.geometry import LineString, MultiPolygon, Polygon, box, shape

from common import (  # noqa: E402
    CACHE, CITIES, DEM_Z, MVT_Z, OUT, Frame, city_boundary, tile_lonlat, write_bin,
)
import gisbldg  # noqa: E402

EXTENT = 4096
DEFAULT_HEIGHT = 5          # OpenMapTiles가 height·levels가 모두 없을 때 넣는 값
DEM_CELL = 30.0             # 표고 격자 간격(m)

ROAD_CLASS = {"motorway": 1, "trunk": 2, "primary": 3, "secondary": 4, "tertiary": 5,
              "minor": 6, "service": 7, "rail": 8, "transit": 9}
WATERWAY_CLASS = {"river": 1, "canal": 2, "stream": 3, "drain": 4, "ditch": 4}
GREEN_CLASS = {"wood": 1, "forest": 1, "park": 2, "grass": 3}

# 도시별 랜드마크 — 지도 자료(POI)의 이름에서 먼저 찾고, 없으면 적어 둔 대략 좌표(추정 표시)를 쓴다
# 바로 가기·랜드마크 비행 — (표시 이름, OSM 이름 후보, 실제 위치(경도, 위도)).
# OSM에서 이름이 같은 지점 중 실제 위치 2km 안에 있는 것만 쓴다(같은 이름 식당·정류장에 끌려가지 않게).
# 찾지 못한 곳은 "대략 좌표(추정)"로 두고 랜드마크 비행에서는 뺀다.
LANDMARKS = {
    "seoul": [("광화문", ["광화문"], (126.9769, 37.5759)),
              ("경복궁", ["경복궁"], (126.9770, 37.5796)),
              ("청와대", ["청와대"], (126.9748, 37.5866)),
              ("서울역", ["서울역"], (126.9707, 37.5547)),
              ("남산서울타워", ["N서울타워", "남산서울타워", "서울타워"], (126.9882, 37.5512)),
              ("동대문디자인플라자", ["동대문디자인플라자"], (127.0095, 37.5665)),
              ("롯데월드타워", ["롯데월드타워"], (127.1025, 37.5126)),
              ("63스퀘어", ["63스퀘어", "63빌딩"], (126.9403, 37.5198)),
              ("여의도", ["국회의사당"], (126.9139, 37.5319))],
    "busan": [("부산역", ["부산역"], (129.0413, 35.1151)),
              ("부산타워", ["부산타워"], (129.0323, 35.1007)),
              ("자갈치시장", ["자갈치시장"], (129.0306, 35.0967)),
              ("부산시민공원", ["부산시민공원"], (129.0567, 35.1683)),
              ("광안대교", ["광안대교"], (129.1170, 35.1476)),
              ("벡스코", ["벡스코"], (129.1363, 35.1690)),
              ("해운대해수욕장", ["해운대해수욕장"], (129.1604, 35.1587)),
              ("금정산", ["고당봉", "금정산"], (129.0527, 35.2837)),
              ("을숙도", ["을숙도"], (128.9395, 35.1022))],
    "sejong": [("정부세종청사", ["정부세종청사"], (127.2660, 36.5031)),
               ("세종호수공원", ["세종호수공원"], (127.2750, 36.4978)),
               ("국립세종도서관", ["국립세종도서관"], (127.2702, 36.5008)),
               ("대통령기록관", ["대통령기록관"], (127.2733, 36.5019)),
               ("세종시청", ["세종특별자치시청"], (127.2890, 36.4801)),
               ("원수산", ["원수산"], (127.2635, 36.5165)),
               ("전월산", ["전월산"], (127.2990, 36.5140)),
               ("금강보행교", ["금강보행교", "이응다리"], (127.2830, 36.4760)),
               ("조치원역", ["조치원역"], (127.2960, 36.6015))],
    "daegu": [("대구시청", ["대구광역시청"], (128.6014, 35.8714)),
              ("동성로", ["동성로"], (128.5953, 35.8690)),
              ("서문시장", ["서문시장"], (128.5810, 35.8686)),
              ("대구역", ["대구역"], (128.5963, 35.8759)),
              ("동대구역", ["동대구역"], (128.6282, 35.8792)),
              ("83타워", ["83타워", "대구타워"], (128.5655, 35.8536)),
              ("수성못", ["수성못"], (128.6189, 35.8283)),
              ("앞산", ["앞산"], (128.5845, 35.8246)),
              ("팔공산", ["비로봉", "팔공산"], (128.6955, 35.9818))],
    "gwangyang": [("광양시청", ["광양시청"], (127.6958, 34.9407)),
                  ("광양읍", ["광양읍"], (127.5800, 34.9750)),
                  ("광양역", ["광양역"], (127.5895, 34.9569)),
                  ("매화마을", ["매화마을", "광양매화마을"], (127.7200, 35.0800)),
                  ("백운산", ["백운산"], (127.6205, 35.1060)),
                  ("이순신대교", ["이순신대교"], (127.7178, 34.9001)),
                  ("광양제철소", ["광양제철소"], (127.7300, 34.9200))],
    "daejeon": [("대전역", ["대전역"], (127.4346, 36.3323)),
                ("대전시청", ["대전광역시청", "대전시청"], (127.3848, 36.3504)),
                ("정부대전청사", ["정부대전청사"], (127.3855, 36.3587)),
                ("한밭수목원", ["한밭수목원"], (127.3887, 36.3677)),
                ("한빛탑", ["한빛탑"], (127.3873, 36.3765)),
                ("국립중앙과학관", ["국립중앙과학관"], (127.3773, 36.3760)),
                ("유성온천", ["유성온천역"], (127.3413, 36.3538)),
                ("대전월드컵경기장", ["대전월드컵경기장"], (127.3252, 36.3651)),
                ("계족산", ["계족산"], (127.4431, 36.3867)),
                ("보문산", ["보문산", "시루봉"], (127.4199, 36.3007))],
    "incheon": [("인천국제공항", ["인천국제공항"], (126.4407, 37.4602)),
                ("인천시청", ["인천광역시청"], (126.7052, 37.4563)),
                ("송도센트럴파크", ["송도센트럴파크"], (126.6390, 37.3925)),
                ("인천역", ["인천역"], (126.6166, 37.4764)),
                ("차이나타운", ["인천차이나타운", "차이나타운"], (126.6177, 37.4757)),
                ("월미도", ["월미도", "월미공원"], (126.5970, 37.4750)),
                ("문학경기장", ["인천문학경기장", "문학경기장"], (126.6931, 37.4344)),
                ("소래포구", ["소래포구", "소래포구역"], (126.7390, 37.4000)),
                ("마니산", ["마니산"], (126.4379, 37.6135))],
    "jeju": [("제주국제공항", ["제주국제공항"], (126.4930, 33.5113)),
             ("제주도청", ["제주특별자치도청"], (126.4989, 33.4890)),
             ("한라산", ["한라산", "백록담"], (126.5332, 33.3617)),
             ("성산일출봉", ["성산일출봉"], (126.9423, 33.4580)),
             ("우도", ["우도"], (126.9510, 33.5040)),
             ("서귀포시청", ["서귀포시청"], (126.5602, 33.2541)),
             ("천지연폭포", ["천지연폭포"], (126.5543, 33.2446)),
             ("중문색달해수욕장", ["중문색달해수욕장", "중문해수욕장"], (126.4105, 33.2445)),
             ("협재해수욕장", ["협재해수욕장"], (126.2397, 33.3940))],
    # 경기 시·군: 실제 위치를 표로 적지 않고 "이름이 같고 그 시·군 경계 안"인 OSM 지점만 쓴다(좌표 None).
    # 시청·군청과 경계 안 가장 높은 봉우리는 모든 시·군에 자동으로 더한다(auto_landmarks).
    "gg-suwon": [("화성행궁", ["화성행궁"], None), ("수원역", ["수원역"], None), ("경기도청", ["경기도청"], None),
                 ("수원월드컵경기장", ["수원월드컵경기장"], None)],
    "gg-seongnam": [("판교역", ["판교역"], None)],
    "gg-goyang": [("킨텍스", ["킨텍스", "KINTEX"], None), ("일산호수공원", ["일산호수공원"], None), ("행주산성", ["행주산성"], None)],
    "gg-yongin": [("에버랜드", ["에버랜드"], None), ("한국민속촌", ["한국민속촌"], None)],
    "gg-paju": [("임진각", ["임진각"], None), ("헤이리예술마을", ["헤이리예술마을", "헤이리"], None)],
    "gg-gwangju-gg": [("남한산성", ["남한산성"], None)],
    "gg-gwacheon": [("서울대공원", ["서울대공원"], None), ("국립과천과학관", ["국립과천과학관"], None)],
    "gg-gwangmyeong": [("광명역", ["광명역"], None), ("광명동굴", ["광명동굴"], None)],
    "gg-pyeongtaek": [("평택역", ["평택역"], None), ("평택항", ["평택항"], None)],
    "gg-gapyeong": [("남이섬", ["남이섬"], None), ("쁘띠프랑스", ["쁘띠프랑스"], None)],
    "gg-yangpyeong": [("두물머리", ["두물머리"], None), ("양평역", ["양평역"], None)],
    "gg-hwaseong": [("융건릉", ["융건릉"], None), ("제부도", ["제부도"], None)],
    "gg-ansan": [("안산역", ["안산역"], None), ("대부도", ["대부도"], None)],
    "gg-bucheon": [("부천역", ["부천역"], None)],
    "gg-anyang": [("안양역", ["안양역"], None)],
    "gg-uijeongbu": [("의정부역", ["의정부역"], None)],
    "gg-icheon": [("이천역", ["이천역"], None), ("설봉공원", ["설봉공원"], None)],
    "gg-yeoju": [("신륵사", ["신륵사"], None), ("여주역", ["여주역"], None)],
    "gg-pocheon": [("산정호수", ["산정호수"], None)],
    "gg-hanam": [("스타필드 하남", ["스타필드 하남", "스타필드하남"], None)],
    "gg-siheung": [("오이도", ["오이도"], None)],
}
# 같은 이름이 여럿이면 지물다운 분류를 먼저: 명소·청사·봉우리·역 > 정류장·대여소 > 식당·가게
GOOD_CLASS = {"attraction", "monument", "museum", "castle", "office", "stadium", "park", "theme_park", "peak",
              "railway", "island", "town", "city", "lake", "river", "bay", "town_hall", "college", "zoo", "viewpoint",
              "airport", "place_of_worship", "beach", "ferry_terminal", "harbor", "aquarium"}
WEAK_CLASS = {"bus", "bicycle_rental", "information", "parking", "entrance"}
LANDMARK_RADIUS_M = 2000


def tile_to_lonlat_fn(x, y):
    n = 2 ** MVT_Z

    def f(px, py):
        gx = (x + px / EXTENT) / n
        gy = (y + py / EXTENT) / n
        return gx * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * gy))))
    return f


def to_local_geom(geom, conv, frame):
    def tx(coords):
        out = []
        for px, py in coords:
            lon, lat = conv(px, py)
            out.append(frame.to_local(lon, lat))
        return out
    return shapely.transform(geom, lambda arr: np.array(tx(arr)))


def encode_building(poly, h, h0, flags):
    rect = shapely.minimum_rotated_rectangle(poly)
    if rect.geom_type != "Polygon":
        return None
    c = list(rect.exterior.coords)[:4]
    e1 = (c[1][0] - c[0][0], c[1][1] - c[0][1])
    e2 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
    w, d = math.hypot(*e1), math.hypot(*e2)
    if w < 1 or d < 1:
        return None
    ang = math.atan2(e1[1], e1[0]) % math.pi
    cx = sum(p[0] for p in c) / 4
    cy = sum(p[1] for p in c) / 4
    area = poly.area
    u16 = lambda v: max(0, min(65535, round(v)))  # noqa: E731 — 음수 높이(자료 오류)는 0으로
    return struct.pack("<HHHHBBHHH", u16(cx), u16(cy), u16(w * 10), u16(d * 10),
                       round(ang / math.pi * 255) & 255, flags, u16(h * 10), u16(h0 * 10), u16(area))


BLDG_STRIDE = 16  # <HHHHBBHHH> = 2+2+2+2+1+1+2+2+2


def line_record(cls, flags, coords):
    pts = [(max(0, min(65535, round(x))), max(0, min(65535, round(y)))) for x, y in coords]
    dedup = [pts[0]] + [p for i, p in enumerate(pts[1:]) if p != pts[i]]
    if len(dedup) < 2:
        return None, 0
    return struct.pack("<BBH", cls, flags, len(dedup)) + b"".join(struct.pack("<HH", *p) for p in dedup), len(dedup)


def triangulate(poly):
    rings = [np.array(poly.exterior.coords[:-1], dtype=np.float64)] + [np.array(r.coords[:-1], dtype=np.float64) for r in poly.interiors]
    if len(rings[0]) < 3:
        return None, None
    verts = np.concatenate(rings)
    ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    idx = earcut.triangulate_float64(verts, ends)
    return verts, idx


def polygons_of(g):
    if g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    if g.geom_type in ("MultiPolygon", "GeometryCollection"):
        return [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon"]
    return []


def lines_of(g):
    if g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if g.geom_type in ("MultiLineString", "GeometryCollection"):
        return [p for p in g.geoms if p.geom_type == "LineString"]
    return []


def find_landmark(pois, names, expected, frame, boundary):
    """이름이 정확히 같은 OSM 지점 중 실제 위치 2km 안(expected가 없으면 도시 경계 안) — 분류가 좋은 것, 그다음 가까운 것"""
    ex, en = frame.to_local(*expected) if expected else (None, None)
    best = None
    for name, ll, cls, _ in pois:
        if name not in names:
            continue
        x, n = frame.to_local(*ll)
        if expected:
            d = math.hypot(x - ex, n - en)
            if d > LANDMARK_RADIUS_M:
                continue
        else:
            if not boundary.contains(shapely.Point(x, n)):
                continue
            d = 0.0
        rank = 0 if cls in GOOD_CLASS else 2 if cls not in WEAK_CLASS else 1
        key = (rank, d)
        if best is None or key < best[0]:
            best = (key, (name, ll, cls))
    return best[1] if best else None


def auto_landmarks(city, pois, frame, boundary):
    """모든 도시에: 시·군청(시군구 단위 도시)과 경계 안에서 가장 높은 봉우리 — 표에 이미 있으면 건너뛴다"""
    out = []
    if "sgg" in city:
        hall = f"{city['sgg'][1]}청"
        out.append((hall, [hall], None))
    peaks = [(ele, name) for name, ll, cls, ele in pois
             if cls == "peak" and ele and boundary.contains(shapely.Point(*frame.to_local(*ll)))]
    if peaks:
        ele, name = max(peaks)
        out.append((f"{name}({ele}m)", [name], None))
    return out


def build_city(city, snapshot):
    polys = city_boundary(city)
    boundary_ll = MultiPolygon([Polygon(p[0], p[1:]) for p in polys]).buffer(0)
    lon_min, lat_min, lon_max, lat_max = boundary_ll.bounds
    pad = 0.01
    frame = Frame(lon_min - pad, lat_min - pad, lon_max + pad, lat_max + pad)
    boundary = shapely.transform(boundary_ll, lambda a: np.array([frame.to_local(x, y) for x, y in a]))
    shapely.prepare(boundary)
    near = boundary.buffer(1500)  # 경계 밖 1.5km까지는 물·숲·도로를 남겨 가장자리가 잘려 보이지 않게
    shapely.prepare(near)

    bldg, roads, waterways = [], [], []
    use_gis = city.get("buildings") == "vworld"
    osm_parts = []  # 건물통합정보를 쓰는 도시: OSM 건물은 높이 보충·누락 보충용으로만 모은다
    water_v, water_i, green_v, green_i, green_c = [], [], [], [], []
    road_pts = ww_pts = 0
    stats = {"buildings_in_tiles": 0, "outside_city": 0, "hidden_3d": 0, "estimated_height": 0, "degenerate": 0}
    pois = []  # (이름, 경위도, 분류) — 랜드마크 찾기용(poi·봉우리·지명·물 이름)
    clip = box(0, 0, EXTENT, EXTENT)
    for f in sorted((CACHE / "mvt" / city["key"]).glob("*.pbf")):
        raw = f.read_bytes()
        if not raw:
            continue
        x, y = (int(v) for v in f.stem.split("_"))
        conv = tile_to_lonlat_fn(x, y)
        layers = mvt.decode(raw, default_options={"y_coord_down": True})
        for ft in layers.get("building", {}).get("features", []):
            p = ft["properties"]
            stats["buildings_in_tiles"] += 1
            if p.get("hide_3d"):
                stats["hidden_3d"] += 1
                continue
            g = shape(ft["geometry"])
            for part in polygons_of(g):
                c = part.centroid
                if not (0 <= c.x < EXTENT and 0 <= c.y < EXTENT):  # 타일 여백 중복 제거: 무게중심 타일만
                    continue
                loc = to_local_geom(part, conv, frame)
                if not boundary.contains(loc.centroid):
                    stats["outside_city"] += 1
                    continue
                h = float(p.get("render_height") or DEFAULT_HEIGHT)
                h0 = float(p.get("render_min_height") or 0)
                flags = 1 if h == DEFAULT_HEIGHT else 0
                if h <= h0:
                    # 시작 높이(min_height)만 있고 높이가 기본값이라 위아래가 뒤집힌 경우 — 시작 높이 + 3m로 세우고 보정 표시
                    h = h0 + 3.0
                    flags |= 2
                    stats["corrected_height"] = stats.get("corrected_height", 0) + 1
                if use_gis:
                    osm_parts.append((loc, h, h0, flags))
                    continue
                rec = encode_building(loc, h, h0, flags)
                if rec is None:
                    stats["degenerate"] += 1
                    continue
                stats["estimated_height"] += 1 if flags else 0
                bldg.append(rec)
        for ft in layers.get("transportation", {}).get("features", []):
            p = ft["properties"]
            cls = ROAD_CLASS.get(p.get("class"))
            if not cls or p.get("brunnel") == "tunnel":
                continue
            flags = 1 if p.get("brunnel") == "bridge" else 0
            for line in lines_of(shapely.clip_by_rect(shape(ft["geometry"]), 0, 0, EXTENT, EXTENT)):
                loc = to_local_geom(line, conv, frame)
                if not near.intersects(loc):
                    continue
                rec, n = line_record(cls, flags, loc.coords)
                if rec:
                    roads.append(rec)
                    road_pts += n
        for ft in layers.get("waterway", {}).get("features", []):
            cls = WATERWAY_CLASS.get(ft["properties"].get("class"))
            if not cls or ft["properties"].get("brunnel") == "tunnel":
                continue
            for line in lines_of(shapely.clip_by_rect(shape(ft["geometry"]), 0, 0, EXTENT, EXTENT)):
                loc = to_local_geom(line, conv, frame)
                if not near.intersects(loc):
                    continue
                rec, n = line_record(cls, 0, loc.coords)
                if rec:
                    waterways.append(rec)
                    ww_pts += n
        for layer, target_v, target_i, klass in (("water", water_v, water_i, None), ("landcover", green_v, green_i, "green"), ("park", green_v, green_i, "park")):
            for ft in layers.get(layer, {}).get("features", []):
                p = ft["properties"]
                if layer == "water" and p.get("class") == "swimming_pool":
                    continue
                if layer == "landcover":
                    gc = GREEN_CLASS.get(p.get("class"))
                    if not gc:
                        continue
                elif layer == "park":
                    gc = GREEN_CLASS["park"]
                for part in polygons_of(shapely.clip_by_rect(shape(ft["geometry"]).buffer(0), 0, 0, EXTENT, EXTENT)):
                    loc = to_local_geom(part, conv, frame).simplify(2.0)
                    if loc.is_empty or loc.area < 50 or not near.intersects(loc):
                        continue
                    for sub in polygons_of(loc):
                        v, idx = triangulate(sub)
                        if v is None or len(idx) == 0:
                            continue
                        target_v.append(v)
                        target_i.append(idx)
                        if klass:
                            green_c.append(np.full(len(v), gc, dtype=np.uint8))
        for layer in ("poi", "mountain_peak", "place", "water_name", "aerodrome_label"):
            for ft in layers.get(layer, {}).get("features", []):
                p = ft["properties"]
                name = p.get("name:ko") or p.get("name")
                if name and ft["geometry"]["type"] == "Point":
                    px, py = ft["geometry"]["coordinates"]
                    if 0 <= px < EXTENT and 0 <= py < EXTENT:
                        cls = "peak" if layer == "mountain_peak" else "airport" if layer == "aerodrome_label" else p.get("class")
                        pois.append((name, conv(px, py), cls, p.get("ele") if layer == "mountain_peak" else None))

    if use_gis:
        stats["osm_buildings"] = len(osm_parts)
        bldg = gisbldg.build(city["key"], frame, boundary, osm_parts, encode_building, stats)
    out = OUT / city["key"]
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    files["buildings.bin"] = write_bin(out / "buildings.bin", "BLDG", len(bldg), BLDG_STRIDE, b"".join(bldg))
    files["roads.bin"] = write_bin(out / "roads.bin", "LINE", len(roads), 0, b"".join(roads), extra=road_pts)
    files["waterways.bin"] = write_bin(out / "waterways.bin", "LINE", len(waterways), 0, b"".join(waterways), extra=ww_pts)
    files["water.bin"], water_tris = write_mesh(out / "water.bin", water_v, water_i, None)
    files["green.bin"], green_tris = write_mesh(out / "green.bin", green_v, green_i, green_c)
    dem_meta = build_terrain(city, frame, out / "terrain.bin")
    files["terrain.bin"] = dem_meta.pop("bytes")

    landmarks = []
    table = LANDMARKS.get(city["key"], [])
    known = {n for _, names, _ in table for n in names}
    extra = [a for a in auto_landmarks(city, pois, frame, boundary) if not set(a[1]) & known]
    for k, (label, names, expected) in enumerate(table + extra):
        auto = k >= len(table)
        hit = find_landmark(pois, names, expected, frame, boundary)
        if not hit and not expected:
            continue  # 좌표를 적지 않은 항목은 찾지 못하면 아예 넣지 않는다
        src = "OSM POI" if hit else "대략 좌표(추정)"
        x, n = frame.to_local(*(hit[1] if hit else expected))
        if not (0 <= x <= frame.width and 0 <= n <= frame.height):
            continue  # 도시 지도 범위 밖(예: 경계 밖으로 빠진 산)
        landmarks.append({"name": label, "x": round(x, 1), "n": round(n, 1), "source": src,
                          "osm_name": hit[0] if hit else None, "osm_class": hit[2] if hit else None,
                          "rule": "auto" if auto else "table" if expected else "table-in-boundary"})

    outline = [[[round(a, 1), round(b, 1)] for a, b in p.exterior.simplify(20).coords] for p in polygons_of(boundary)]
    meta = {
        "key": city["key"], "name": city["name"], "frame": frame.meta(),
        "snapshot": snapshot, "terrain": dem_meta,
        "counts": {"buildings": len(bldg), "roads": len(roads), "road_points": road_pts,
                   "waterways": len(waterways), "waterway_points": ww_pts,
                   "water_triangles": water_tris, "green_triangles": green_tris,
                   "estimated_height": stats["estimated_height"], "corrected_height": stats.get("corrected_height", 0),
                   **({"gis_height": stats["gis_height"], "gis_floors": stats["gis_floors"],
                       "osm_height_join": stats["osm_height_join"], "osm_only": stats["osm_only"]} if use_gis else {})},
        "building_source": "molit-gis" if use_gis else "osm",
        "build_stats": stats,
        "files": {k: {"bytes": v, "crc32": crc_of(out / k)} for k, v in files.items()},
        "landmarks": landmarks, "outline": outline,
        "note": city.get("exclude_sgg") and f"경계에서 {', '.join(city['exclude_sgg'])} 제외",
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return meta


def crc_of(path):
    raw = Path(path).read_bytes()
    return struct.unpack_from("<I", raw, 24)[0]


def write_mesh(path, vs, idxs, classes):
    """MESH 본문: [정점 수 uint32][삼각형 수 uint32][정점 x,n uint16…][class uint8… 또는 없음][색인 uint32…]"""
    if not vs:
        return write_bin(path, "MESH", 0, 0, struct.pack("<II", 0, 0)), 0
    base = 0
    all_idx = []
    for v, i in zip(vs, idxs):
        all_idx.append(i.astype(np.uint32) + base)
        base += len(v)
    verts = np.clip(np.round(np.concatenate(vs)), 0, 65535).astype("<u2")
    idx = np.concatenate(all_idx).astype("<u4")
    body = struct.pack("<II", len(verts), len(idx) // 3) + verts.tobytes()
    if classes is not None:
        body += np.concatenate(classes).astype("u1").tobytes()
        if len(verts) % 4:
            body += b"\0" * (4 - len(verts) % 4)  # 색인 배열을 4바이트 경계에
    body += idx.tobytes()
    return write_bin(path, "MESH", len(idx) // 3, 0, body, extra=1 if classes is not None else 0), len(idx) // 3


def build_terrain(city, frame, path):
    from common import tile_xy
    files = sorted((CACHE / "dem" / city["key"]).glob("*.png"))
    xs = sorted({int(f.stem.split("_")[0]) for f in files})
    ys = sorted({int(f.stem.split("_")[1]) for f in files})
    x0, y0 = xs[0], ys[0]
    mosaic = np.full(((ys[-1] - y0 + 1) * 256, (xs[-1] - x0 + 1) * 256), np.nan, dtype=np.float32)
    for f in files:
        tx, ty = (int(v) for v in f.stem.split("_"))
        rgb = np.asarray(Image.open(io.BytesIO(f.read_bytes())).convert("RGB"), dtype=np.float32)
        mosaic[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
    cols = int(frame.width // DEM_CELL) + 1
    rows = int(frame.height // DEM_CELL) + 1
    xs_m = np.arange(cols) * DEM_CELL
    ns_m = (rows - 1 - np.arange(rows)) * DEM_CELL  # 행 0 = 북쪽
    gx, gn = np.meshgrid(xs_m, ns_m)
    lon = frame.lon0 + gx / frame.m_lon
    lat = frame.lat0 + gn / 110574.0
    fx = (lon + 180) / 360 * 2 ** DEM_Z
    fy = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / np.pi) / 2 * 2 ** DEM_Z
    px = (fx - x0) * 256
    py = (fy - y0) * 256
    # 쌍선형 보간
    ix = np.clip(np.floor(px).astype(int), 0, mosaic.shape[1] - 2)
    iy = np.clip(np.floor(py).astype(int), 0, mosaic.shape[0] - 2)
    tx, ty = px - ix, py - iy
    m = mosaic
    h = (m[iy, ix] * (1 - tx) * (1 - ty) + m[iy, ix + 1] * tx * (1 - ty) + m[iy + 1, ix] * (1 - tx) * ty + m[iy + 1, ix + 1] * tx * ty)
    missing = int(np.isnan(h).sum())
    # 받지 않은 표고 타일 자리(도시 경계 밖)는 -32768로 표시 — 화면이 평평한 판으로 오해하지 않게 따로 칠한다
    q = np.where(np.isnan(h), -32768, np.clip(np.round(np.nan_to_num(h) * 4), -32767, 32767)).astype("<i2")
    h = np.nan_to_num(h, nan=0.0)
    size = write_bin(path, "DEMG", q.size, 2, q.tobytes(), extra=cols)
    return {"bytes": size, "cols": cols, "rows": rows, "cell": DEM_CELL, "unit_m": 0.25,
            "min_m": round(float(h.min()), 1), "max_m": round(float(h.max()), 1), "missing_cells": missing,
            "source_zoom": DEM_Z, "tiles": len(files)}


def main():
    snapshot = (CACHE / "snapshot.txt").read_text().strip()
    only = sys.argv[1:] or [c["key"] for c in CITIES]
    summary = {}
    for city in CITIES:
        if city["key"] not in only:
            continue
        meta = build_city(city, snapshot)
        summary[city["key"]] = meta["counts"] | {"bytes": sum(v["bytes"] for v in meta["files"].values())}
        print(city["key"], json.dumps(summary[city["key"]], ensure_ascii=False), flush=True)
    idx_path = OUT / "cities.json"
    cities = {}  # 목록은 산출된 meta.json에서 매번 다시 만든다(이전 파일을 읽어 덧붙이면 중첩된다)
    for c in CITIES:
        mp = OUT / c["key"] / "meta.json"
        if mp.exists():
            m = json.loads(mp.read_text())
            cities[c["key"]] = {"name": c["name"], "buildings": m["counts"]["buildings"]}
    idx_path.write_text(json.dumps({"snapshot": snapshot, "cities": cities}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
