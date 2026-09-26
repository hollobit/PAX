#!/usr/bin/env python3
"""3D PAX 지도용 광역시도 경계 생성.

Natural Earth 10m admin-1(퍼블릭 도메인)에서 대한민국 17개 시도를 골라,
사이트가 쓰는 짧은 지역명(서울·경기…)으로 키를 바꾸고 선을 단순화해
폴리곤마다 [외곽, 구멍…] 고리 목록으로
site/data/korea-geo.json에 쓴다. 원본(약 40MB)은 저장소에 두지 않는다 — 다시 만들 때:

    curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
    python3 scripts/build_korea_geo.py ne_10m_admin_1_states_provinces.geojson
"""
import json
import sys
from pathlib import Path

OUT = Path("site/data/korea-geo.json")

# ISO 3166-2 → 사이트 지역명 (gap-map.js REGIONS와 같은 17개)
ISO_TO_REGION = {
    "KR-11": "서울", "KR-26": "부산", "KR-27": "대구", "KR-28": "인천",
    "KR-29": "광주", "KR-30": "대전", "KR-31": "울산", "KR-50": "세종",
    "KR-41": "경기", "KR-42": "강원", "KR-43": "충북", "KR-44": "충남",
    "KR-45": "전북", "KR-46": "전남", "KR-47": "경북", "KR-48": "경남",
    "KR-49": "제주",
}

EPSILON = 0.004        # 단순화 허용 오차(도) — 약 400m, 미니어처 축척에서 보이지 않는 굴곡
MIN_RING_AREA = 0.0012  # 이보다 작은 섬(도²)은 버린다 — 울릉도(약 0.0075)는 남는다


def _perp_dist(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2) ** 0.5


def simplify(points, eps):
    """Ramer–Douglas–Peucker (반복형 — 긴 해안선에서 재귀 한도를 넘지 않게)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        idx, dmax = None, eps
        for i in range(s + 1, e):
            d = _perp_dist(points[i], points[s], points[e])
            if d > dmax:
                idx, dmax = i, d
        if idx is not None:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    return [p for p, k in zip(points, keep) if k]


def ring_area(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))) / 2


def polygons_of(geometry):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return polys


def clean_ring(ring):
    pts = [(round(x, 4), round(y, 4)) for x, y in ring]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    if ring_area(pts) < MIN_RING_AREA:
        return None
    simple = simplify(pts + [pts[0]], EPSILON)[:-1]
    return [[round(x, 3), round(y, 3)] for x, y in simple] if len(simple) >= 3 else None


def build(src: Path) -> dict:
    features = json.loads(src.read_text())["features"]
    regions = {}
    for f in features:
        region = ISO_TO_REGION.get(f["properties"].get("iso_3166_2"))
        if not region:
            continue
        polys = []
        for poly in polygons_of(f["geometry"]):
            outer = clean_ring(poly[0])
            if not outer:
                continue
            # 구멍을 지키지 않으면 서울을 둘러싼 경기 윗면이 서울과 겹쳐 깜빡인다(광주·대구도 같다).
            holes = [h for h in (clean_ring(r) for r in poly[1:]) if h]
            polys.append([outer, *holes])
        polys.sort(key=lambda p: ring_area(p[0]), reverse=True)
        regions[region] = polys
    missing = set(ISO_TO_REGION.values()) - set(regions)
    if missing:
        raise SystemExit(f"누락된 시도: {sorted(missing)}")
    return {
        "source": "Natural Earth 10m admin-1 (public domain), simplified",
        "regions": {r: regions[r] for r in ISO_TO_REGION.values()},
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    doc = build(Path(sys.argv[1]))
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    pts = sum(len(r) for polys in doc["regions"].values() for p in polys for r in p)
    print(f"{OUT} ← 시도 {len(doc['regions'])}개 · 꼭짓점 {pts}개 · {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
