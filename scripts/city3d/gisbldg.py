"""국토교통부 GIS건물통합정보(VWorld LT_C_BLDGINFO) → 건물 레코드.

vworld.py가 받아 둔 칸 파일을 읽어 도시 로컬 좌표로 옮기고, 높이를 아래 순서로 정한다.
  1) 건축물대장 높이(height, m) — 2m 이상 600m 이하만 믿는다
  2) 지상층수(grnd_flr) × 3m — 층수 환산(플래그 8)
  3) 같은 자리 OSM 건물의 실제 높이(OSM height·building:levels) — OSM 출처로 표시
  4) 기본값 5m — 추정(플래그 1, 회색)
건물통합정보에 없고 OSM에만 있는 건물(윤곽 무게중심이 어느 통합정보 건물에도 들지 않는 것)은 OSM 그대로 더한다.

플래그 비트: 1 추정 높이 · 2 보정 높이(OSM) · 4 출처 = 건물통합정보 · 8 높이 = 지상층수 × 3m
"""
from __future__ import annotations

import json
import re

import numpy as np
import shapely
from shapely.geometry import shape
from shapely.strtree import STRtree

from common import CACHE

FLOOR_M = 3.0
DEFAULT_HEIGHT = 5.0
MIN_TRUST_H, MAX_TRUST_H = 2.0, 600.0
F_EST, F_CORR, F_GIS, F_FLOORS = 1, 2, 4, 8
# 지상에 서지 않는 시설 — 높이·층수가 없을 때 이름으로 거른다(지하상가·지하철역·지하차도 윤곽이 광장·도로 위에 판으로 서지 않게)
UNDERGROUND_NAME = re.compile(r"지하|\d호선|역\(|역$|지하차도|지하보도|주차장")
BIG_FLAT_M2 = 2000  # 높이·층수·OSM 대응이 모두 없는 2,000㎡ 넘는 윤곽은 지하 구조물로 보고 뺀다


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def gis_height(props: dict) -> tuple[float, int] | None:
    """(높이 m, 플래그) — 건물통합정보 속성만으로 정할 수 없으면 None."""
    h = _num(props.get("height"))
    if MIN_TRUST_H <= h <= MAX_TRUST_H:
        return h, F_GIS
    floors = int(_num(props.get("grnd_flr")))
    if floors > 0:
        return floors * FLOOR_M, F_GIS | F_FLOORS
    return None


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
                 gis_height=0, gis_floors=0, osm_height_join=0,
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
        hit = gis_height(props)
        h0 = 0.0
        if hit:
            h, flags = hit
            stats["gis_floors" if flags & F_FLOORS else "gis_height"] += 1
        else:
            h, flags = DEFAULT_HEIGHT, F_GIS | F_EST
            if osm_tree is not None:
                for k in osm_tree.query(whole.centroid, predicate="within"):
                    oh, oh0, of = osm_parts[k][1], osm_parts[k][2], osm_parts[k][3]
                    if not of & (F_EST | F_CORR):
                        h, h0, flags = oh, oh0, F_GIS  # OSM 실제 높이를 빌려 쓴다(출처는 건물통합정보 윤곽)
                        stats["osm_height_join"] += 1
                        break
            if flags & F_EST and sum(q.area for q in parts) > BIG_FLAT_M2 and (
                    osm_tree is None or not len(osm_tree.query(whole.centroid, predicate="within"))):
                stats["gis_big_flat"] += 1  # 정보도 OSM 대응도 없는 큰 판 — 광장 지하상가 같은 지하 구조물
                continue
        for p in parts:
            rec = encode(p, h, h0, flags)
            if rec is None:
                stats["degenerate"] += 1
                continue
            recs.append(rec)
            gis_polys.append(p)
            stats["estimated_height"] += 1 if flags & F_EST else 0  # 레코드 단위(여러 조각 건물은 조각마다)
    gis_tree = STRtree(gis_polys) if gis_polys else None
    for poly, h, h0, flags in osm_parts:
        if gis_tree is not None and len(gis_tree.query(poly.centroid, predicate="within")):
            continue
        rec = encode(poly, h, h0, flags)
        if rec is not None:
            recs.append(rec)
            stats["osm_only"] += 1
            stats["estimated_height"] += 1 if flags & (F_EST | F_CORR) else 0
    return recs
