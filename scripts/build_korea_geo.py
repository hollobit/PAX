#!/usr/bin/env python3
"""3D PAX 지도용 경계 생성 — 광역시도(지형)와 시군구(상세 경계·배치).

원자료는 통계청 SGIS 행정동 경계를 가공한 vuski/admdongkor(CC BY 4.0)다. 행정동을 시군구·시도로
합쳐(dissolve) 선을 단순화하고, 사이트가 쓰는 짧은 지역명(서울·경기…)으로 키를 맞춘다.
두 층이 같은 원자료에서 나오므로 시군구 선이 시도 경계와 어긋나지 않는다.

    curl -LO https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson
    uv run --with shapely python3 scripts/build_korea_geo.py HangJeongDong_ver20260701.geojson

shapely는 생성할 때만 필요하다(사이트·테스트는 결과 JSON만 읽는다).
"""
import json
import re
import sys
from pathlib import Path

OUT_SIDO = Path("site/data/korea-geo.json")
OUT_SGG = Path("site/data/korea-sgg.json")

ATTRIBUTION = ("통계청 SGIS 행정동 경계(공공누리 제1유형)를 vuski/admdongkor가 가공, CC BY 4.0 — "
               "3D PAX에서 시군구·시도로 병합·단순화")

SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원", "충청북도": "충북",
    "충청남도": "충남", "전북특별자치도": "전북", "전라북도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
}
# 2026-07 출범한 전남광주통합특별시는 사례 원장이 아직 광주·전남으로 나눠 적는다 — 옛 광주 자치구로 가른다.
MERGED_CITY = "전남광주통합특별시"
FORMER_GWANGJU = {"동구", "서구", "남구", "북구", "광산구"}
REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
           "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]

SIDO_TOLERANCE = 0.004    # 도 단위 — 약 400m
SGG_TOLERANCE = 0.002
SIDO_MIN_PART = 0.0008    # 이보다 작은 섬(도²)은 지형에서 뺀다 — 울릉도(약 0.0075)는 남는다
SGG_MIN_PART = 0.0003


def region_of(sidonm: str, sggnm: str) -> str | None:
    if sidonm == MERGED_CITY:
        return "광주" if sggnm in FORMER_GWANGJU else "전남"
    return SIDO_SHORT.get(sidonm)


def sgg_name(sidonm: str, sggnm: str) -> str:
    """도(道) 안의 일반구는 시로 합친다: '성남시분당구' → '성남시'. 특별·광역시의 자치구는 그대로."""
    if sidonm.endswith("도"):
        m = re.match(r"^(.+?시)(.+구)$", sggnm)
        if m:
            return m.group(1)
    return sggnm


def _rings(geom, min_part, tol):
    """shapely (Multi)Polygon → [[외곽, 구멍…], …] (경도·위도 소수 3자리 ≈ 100m)."""
    geom = geom.simplify(tol, preserve_topology=True)
    parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    out = []
    for p in sorted(parts, key=lambda g: g.area, reverse=True):
        if p.area < min_part or p.is_empty:
            continue
        rings = [p.exterior] + [h for h in p.interiors if abs(_area(h.coords)) >= min_part]
        out.append([[[round(x, 3), round(y, 3)] for x, y in list(r.coords)[:-1]] for r in rings])
    return out


def _area(coords):
    pts = list(coords)
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1])) / 2


def build(src: Path):
    from shapely.geometry import shape
    from shapely.ops import unary_union

    by_sido, by_sgg = {}, {}
    for f in json.loads(src.read_text())["features"]:
        p = f["properties"]
        region = region_of(p["sidonm"], p["sggnm"])
        if not region:
            raise SystemExit(f"알 수 없는 시도: {p['sidonm']}")
        g = shape(f["geometry"]).buffer(0)
        by_sido.setdefault(region, []).append(g)
        by_sgg.setdefault((region, sgg_name(p["sidonm"], p["sggnm"])), []).append(g)

    missing = set(REGIONS) - set(by_sido)
    if missing:
        raise SystemExit(f"누락된 시도: {sorted(missing)}")
    # 이웃 행정동 사이 미세 틈이 합친 뒤 구멍으로 남지 않게 살짝 부풀렸다 되돌린다
    merge = lambda gs: unary_union(gs).buffer(0.0004).buffer(-0.0004)
    sido = {r: _rings(merge(by_sido[r]), SIDO_MIN_PART, SIDO_TOLERANCE) for r in REGIONS}
    sgg = []
    for (region, name), gs in sorted(by_sgg.items()):
        u = merge(gs)
        pt = u.representative_point()
        sgg.append({"name": name, "region": region, "center": [round(pt.x, 4), round(pt.y, 4)],
                    "polys": _rings(u, SGG_MIN_PART, SGG_TOLERANCE)})
    meta = {"source": "vuski/admdongkor ver20260701 (SGIS)", "license": "CC BY 4.0", "attribution": ATTRIBUTION}
    return {**meta, "regions": sido}, {**meta, "sgg": sgg}


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    sido, sgg = build(Path(sys.argv[1]))
    for path, doc in ((OUT_SIDO, sido), (OUT_SGG, sgg)):
        path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
        print(f"{path} ← {path.stat().st_size // 1024}KB")
    print(f"시도 {len(sido['regions'])}개 · 시군구 {len(sgg['sgg'])}개")


if __name__ == "__main__":
    main()
