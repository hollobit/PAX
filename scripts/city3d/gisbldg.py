"""국토교통부 GIS건물통합정보(VWorld LT_C_BLDGINFO) → 건물 레코드.

vworld.py가 받아 둔 칸 파일을 읽어 도시 로컬 좌표로 옮기고, 높이를 아래 순서로 정한다.
  1) 건축물대장 높이(height, m) — 층수와 맞을 때만 믿는다(registry_height)
  2) 같은 자리 OSM 건물의 실제 높이 — 초고층은 층수 환산보다 OSM 실측이 정확하다(롯데월드타워 123층 × 3m = 369m ≠ 555m)
  3) 지상층수(grnd_flr) × 3m — 층수 환산(플래그 8), 80층 넘는 층수는 오기로 본다
  4) 기본값 5m — 추정(플래그 1, 회색)
건물통합정보에 없고 OSM에만 있는 건물(윤곽 무게중심이 어느 통합정보 건물에도 들지 않는 것)은 OSM 그대로 더한다.

건물 하나는 최소 회전 직사각형 상자 하나로 그린다. 오목하거나 길쭉한 윤곽(상자를 55% 미만 채우고 한 변 40m 초과)은
상자 하나로 그리면 마당·도로를 덮는 판이 되므로, 건물 방향 25m 격자로 잘라 조각마다 상자를 세운다(split_pieces).

플래그 비트: 1 추정 높이 · 2 보정 높이(OSM) · 4 출처 = 건물통합정보 · 8 높이 = 지상층수 × 3m · 16~64 용도(외벽 종류 0~7)
"""
from __future__ import annotations

import json
import math
import re

import numpy as np
import shapely
from shapely import affinity
from shapely.geometry import box, shape
from shapely.strtree import STRtree

from common import CACHE

FLOOR_M = 3.0
DEFAULT_HEIGHT = 5.0
MIN_TRUST_H, MAX_TRUST_H = 2.0, 600.0
F_EST, F_CORR, F_GIS, F_FLOORS = 1, 2, 4, 8
MAX_FLOORS = 80                  # 국내 최고 123층(롯데월드타워)은 OSM 실측이 먼저 잡는다 — 그 밖의 80층 초과는 오기
LOW_RISE_MAX_H = 25.0            # 1~2층 건물(강당·체육관·공장)은 층고가 높아 층당 비율 대신 이 높이까지 믿는다
PER_FLOOR_M = (2.0, 7.0)         # 3층 이상: 높이 ÷ 층수가 이 범위일 때만 대장 높이를 믿는다
NO_FLOOR_MAX_H = 60.0            # 층수 없이 높이만 있으면 이 높이까지만 믿는다(작은 바닥에 300m 같은 오기)
SPLIT_FILL, SPLIT_SIDE_M, SPLIT_CELL_M, SPLIT_MIN_M2 = 0.55, 40.0, 25.0, 4.0
# 용도 → 외벽 종류(플래그 4~6비트, 0~7). 화면 셰이더(layers.js)가 같은 번호로 외벽을 그린다.
# 0 미상(높이로 짐작) · 1 공동주택 · 2 단독주택 · 3 근린생활·판매 · 4 업무·숙박 · 5 공장·창고 · 6 공공·교육·의료·문화
KIND_SHIFT = 4
USE_KIND = {"01": 2, "02": 1, "03": 3, "04": 3, "07": 3, "16": 3, "14": 4, "15": 4,
            "17": 5, "18": 5, "19": 5, "20": 5, "21": 5, "22": 5,
            "05": 6, "06": 6, "08": 6, "09": 6, "10": 6, "11": 6, "12": 6, "13": 6, "23": 6, "24": 6, "26": 6}


def use_kind(props: dict) -> int:
    """건축물 용도 코드(usability, 예: 02000 공동주택)의 앞 두 자리 → 외벽 종류 번호."""
    code = (props.get("usability") or "").strip()
    return USE_KIND.get(code[:2], 0) if len(code) >= 2 else 0
# 지상에 서지 않는 시설 — 높이·층수가 없을 때 이름으로 거른다(지하상가·지하철역·지하차도 윤곽이 광장·도로 위에 판으로 서지 않게)
UNDERGROUND_NAME = re.compile(r"지하|\d호선|역\(|역$|지하차도|지하보도|주차장")
BIG_FLAT_M2 = 2000  # 높이·층수·OSM 대응이 모두 없는 2,000㎡ 넘는 윤곽은 지하 구조물로 보고 뺀다


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def registry_height(props: dict) -> float | None:
    """건축물대장 높이 — 층수와 어긋나는 오기(1층 305m, 3층 123m 등)는 버린다."""
    h = _num(props.get("height"))
    if not MIN_TRUST_H <= h <= MAX_TRUST_H:
        return None
    floors = int(_num(props.get("grnd_flr")))
    if floors <= 0:
        return h if h <= NO_FLOOR_MAX_H else None
    if floors <= 2:
        return h if h <= LOW_RISE_MAX_H else None
    return h if PER_FLOOR_M[0] <= h / floors <= PER_FLOOR_M[1] else None


def floor_height(props: dict) -> float | None:
    floors = int(_num(props.get("grnd_flr")))
    return floors * FLOOR_M if 0 < floors <= MAX_FLOORS else None


def gis_height(props: dict) -> tuple[float, int] | None:
    """(높이 m, 플래그) — 건물통합정보 속성만으로 정할 수 없으면 None(OSM 높이를 끼우지 않은 순서)."""
    rh = registry_height(props)
    if rh is not None:
        return rh, F_GIS
    fh = floor_height(props)
    if fh is not None:
        return fh, F_GIS | F_FLOORS
    return None


def split_pieces(poly):
    """오목·길쭉한 윤곽을 건물 방향 격자로 잘라 조각 목록으로(상자 근사가 마당·도로를 덮지 않게). 아니면 [poly]."""
    rect = shapely.minimum_rotated_rectangle(poly)
    if rect.geom_type != "Polygon" or rect.area <= 0:
        return [poly]
    c = list(rect.exterior.coords)[:4]
    w = math.dist(c[0], c[1])
    d = math.dist(c[1], c[2])
    if poly.area / rect.area >= SPLIT_FILL or max(w, d) <= SPLIT_SIDE_M:
        return [poly]
    ang = math.atan2(c[1][1] - c[0][1], c[1][0] - c[0][0])
    origin = poly.centroid
    flat = affinity.rotate(poly, -ang, origin=origin, use_radians=True)
    x0, y0, x1, y1 = flat.bounds
    out = []
    for i in range(int((x1 - x0) // SPLIT_CELL_M) + 1):
        for j in range(int((y1 - y0) // SPLIT_CELL_M) + 1):
            cell = box(x0 + i * SPLIT_CELL_M, y0 + j * SPLIT_CELL_M, x0 + (i + 1) * SPLIT_CELL_M, y0 + (j + 1) * SPLIT_CELL_M)
            piece = flat.intersection(cell)
            for q in getattr(piece, "geoms", [piece]):
                if q.geom_type == "Polygon" and q.area >= SPLIT_MIN_M2:
                    out.append(affinity.rotate(q, ang, origin=origin, use_radians=True))
    return out or [poly]


def is_underground(props: dict) -> bool:
    """지상층 0·지하층만 있는 시설, 또는 높이·층수 없이 이름이 지하 시설인 것."""
    if int(_num(props.get("grnd_flr"))) == 0 and int(_num(props.get("ugrnd_flr"))) > 0:
        return True
    return gis_height(props) is None and bool(UNDERGROUND_NAME.search((props.get("bld_nm") or "").strip()))


def load_features(city_key: str) -> list[dict]:
    """칸 파일들을 읽어 id로 중복을 걷는다(칸 경계에 걸친 건물은 두 칸에서 온다)."""
    seen, feats = set(), []
    for path in sorted((CACHE / "vworld" / city_key).glob("[0-9]*.json")):
        for f in json.loads(path.read_text(encoding="utf-8"))["features"]:
            fid = f.get("id") or json.dumps(f["geometry"]["coordinates"][:1])[:200]
            if fid in seen:
                continue
            seen.add(fid)
            feats.append(f)
    return feats


def build(city_key: str, frame, boundary, osm_parts: list, encode, stats: dict) -> list[bytes]:
    """osm_parts: [(로컬 폴리곤, 높이, 시작 높이, 플래그)] — 같은 도시 OSM 건물(높이 보충·누락 보충용).
    encode: process.encode_building."""
    to_local = lambda arr: np.array([frame.to_local(x, y) for x, y in arr])  # noqa: E731
    osm_geoms = [p[0] for p in osm_parts]
    osm_tree = STRtree(osm_geoms) if osm_geoms else None
    feats = load_features(city_key)
    stats.update(gis_features=len(feats), gis_outside=0, gis_underground=0, gis_big_flat=0,
                 gis_height=0, gis_floors=0, osm_height_join=0, split_buildings=0,
                 estimated_height=0, osm_only=0, degenerate=stats.get("degenerate", 0))
    recs, gis_polys = [], []
    for f in feats:
        try:
            g = shapely.transform(shape(f["geometry"]), to_local)
        except Exception:  # noqa: BLE001 — 깨진 도형 한 건이 도시 빌드를 멈추지 않게
            stats["degenerate"] += 1
            continue
        parts = [p for p in getattr(g, "geoms", [g]) if p.geom_type == "Polygon" and not p.is_empty]
        if not parts:
            continue
        whole = max(parts, key=lambda p: p.area)
        if not boundary.contains(whole.centroid):
            stats["gis_outside"] += 1
            continue
        props = f.get("properties") or {}
        if is_underground(props):
            stats["gis_underground"] += 1
            continue
        h0 = 0.0
        rh = registry_height(props)
        osm_hit = None
        if rh is None and osm_tree is not None:
            # 겹친 OSM 조각(건물 외곽·building:part)이 여럿이면 가장 높은 것 — 탑 부분이 저층부보다 먼저 잡히게
            for k in osm_tree.query(whole.centroid, predicate="within"):
                oh, oh0, of = osm_parts[k][1], osm_parts[k][2], osm_parts[k][3]
                if not of & (F_EST | F_CORR) and (osm_hit is None or oh > osm_hit[0]):
                    osm_hit = (oh, oh0)
        fh = floor_height(props)
        if rh is not None:
            h, flags = rh, F_GIS
            stats["gis_height"] += 1
        elif osm_hit:
            (h, h0), flags = osm_hit, F_GIS  # OSM 실제 높이를 빌려 쓴다(출처는 건물통합정보 윤곽)
            stats["osm_height_join"] += 1
        elif fh is not None:
            h, flags = fh, F_GIS | F_FLOORS
            stats["gis_floors"] += 1
        else:
            h, flags = DEFAULT_HEIGHT, F_GIS | F_EST
            if sum(q.area for q in parts) > BIG_FLAT_M2 and (
                    osm_tree is None or not len(osm_tree.query(whole.centroid, predicate="within"))):
                stats["gis_big_flat"] += 1  # 정보도 OSM 대응도 없는 큰 판 — 광장 지하상가 같은 지하 구조물
                continue
        flags |= use_kind(props) << KIND_SHIFT
        for p in parts:
            gis_polys.append(p)
            pieces = split_pieces(p)
            stats["split_buildings"] += 1 if len(pieces) > 1 else 0
            for q in pieces:
                rec = encode(q, h, h0, flags)
                if rec is None:
                    stats["degenerate"] += 1
                    continue
                recs.append(rec)
                stats["estimated_height"] += 1 if flags & F_EST else 0  # 레코드 단위(여러 조각 건물은 조각마다)
    gis_tree = STRtree(gis_polys) if gis_polys else None
    for poly, h, h0, flags in osm_parts:
        if gis_tree is not None and len(gis_tree.query(poly.centroid, predicate="within")):
            continue
        pieces = split_pieces(poly)
        stats["split_buildings"] += 1 if len(pieces) > 1 else 0
        stats["osm_only"] += 1
        for q in pieces:
            rec = encode(q, h, h0, flags)
            if rec is not None:
                recs.append(rec)
                stats["estimated_height"] += 1 if flags & (F_EST | F_CORR) else 0
    return recs
