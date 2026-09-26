#!/usr/bin/env python3
"""3D PAX 실제 지형 — 대한민국 수치표고(DEM)를 지도 투영 격자로 담는다 (사용자 지시 2026-09-27).

원자료: AWS Terrain Tiles(Terrarium, Mapzen/Tilezen 공개 데이터셋 — 한국은 주로 SRTM, 퍼블릭 도메인) z8 타일 36장.
지도(pax3d-geom.js)와 같은 등장방형 투영의 균일 격자(CELL 단위)로 다시 표본을 뜨고, 칸마다
①표고 코드(0=바다·국외, 1~255=√표고 척도) ②광역시도 번호(0=없음, 1~17=REGIONS 순서)를 1바이트씩 담는다.
시도 판정은 브라우저에서 하기엔 무거워(격자 13만 칸 × 경계 수천 점) 여기서 shapely로 미리 한다.

    uv run --with shapely --with numpy --with pillow python3 scripts/build_korea_dem.py

출력: site/data/korea-dem.json(메타) + site/data/korea-dem.bin(표고 코드 rows×cols, 이어서 시도 번호 rows×cols)
"""
import io
import json
import math
import urllib.request
from pathlib import Path

GEO = Path("site/data/korea-geo.json")
OUT_META = Path("site/data/korea-dem.json")
OUT_BIN = Path("site/data/korea-dem.bin")
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
Z = 8
UA = "PAX-3D-map-build (https://github.com/hollobit/PAX)"

# pax3d-geom.js와 같은 투영 — 한쪽만 바꾸면 지형과 경계가 어긋난다
LON0, LAT0, KM, S = 127.7, 35.95, 111.32, 0.023
COS = math.cos(math.radians(LAT0))
CELL = 0.04          # 격자 한 칸(월드 단위) ≈ 1.7km
MAX_M = 2000.0       # 코드 255 ≈ 2000m (한라산 1,947m)
REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
           "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]


def to_lonlat(x, north):
    return x / (KM * COS * S) + LON0, north / (KM * S) + LAT0


def encode(meters):
    """√ 척도 — 낮은 구릉의 기복도 1바이트에 남긴다. 0은 바다 자리라 육지는 1부터."""
    return 1 + round(math.sqrt(max(0.0, min(meters, MAX_M)) / MAX_M) * 254)


def decode(code):
    return 0.0 if code == 0 else ((code - 1) / 254) ** 2 * MAX_M


def tile_xy(lon, lat, z):
    n = 2 ** z
    return ((lon + 180) / 360 * n,
            (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)


def main():
    import numpy as np
    from PIL import Image
    import shapely
    from shapely.geometry import Polygon, MultiPolygon

    geo = json.loads(GEO.read_text())
    shapes = []
    for name in REGIONS:
        polys = [Polygon(p[0], p[1:]) for p in geo["regions"][name]]
        shapes.append(shapely.make_valid(MultiPolygon(polys)))

    # 격자 범위: 시도 경계의 월드 좌표 상자 + 여백
    lons = [x for polys in geo["regions"].values() for p in polys for x, _ in p[0]]
    lats = [y for polys in geo["regions"].values() for p in polys for _, y in p[0]]
    x_min = (min(lons) - LON0) * KM * COS * S - 0.2
    x_max = (max(lons) - LON0) * KM * COS * S + 0.2
    n_min = (min(lats) - LAT0) * KM * S - 0.2
    n_max = (max(lats) - LAT0) * KM * S + 0.2
    cols = int(math.ceil((x_max - x_min) / CELL)) + 1
    rows = int(math.ceil((n_max - n_min) / CELL)) + 1

    # 타일 받기
    tx0, ty0 = (int(v) for v in tile_xy(min(lons) - 0.1, max(lats) + 0.1, Z))
    tx1, ty1 = (int(v) for v in tile_xy(max(lons) + 0.1, min(lats) - 0.1, Z))
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            req = urllib.request.Request(TILE_URL.format(z=Z, x=tx, y=ty), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                rgb = np.asarray(Image.open(io.BytesIO(r.read())).convert("RGB"), dtype=np.float32)
            elev = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = elev
    print(f"타일 {(tx1 - tx0 + 1) * (ty1 - ty0 + 1)}장 · 격자 {cols}×{rows}")

    # 격자 칸 중심(행 0 = 북쪽 끝)
    xs = x_min + np.arange(cols) * CELL
    norths = n_max - np.arange(rows) * CELL
    gx, gn = np.meshgrid(xs, norths)
    lon = gx / (KM * COS * S) + LON0
    lat = gn / (KM * S) + LAT0
    fx = (lon + 180) / 360 * 2 ** Z
    fy = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / np.pi) / 2 * 2 ** Z
    px = np.clip(((fx - tx0) * 256).astype(int), 0, mosaic.shape[1] - 1)
    py = np.clip(((fy - ty0) * 256).astype(int), 0, mosaic.shape[0] - 1)
    meters = mosaic[py, px]

    region = np.zeros((rows, cols), dtype=np.uint8)
    for i, shp in enumerate(shapes, start=1):
        shapely.prepare(shp)
        inside = shapely.contains_xy(shp, lon, lat)
        region[inside & (region == 0)] = i
    code = np.where(region > 0, 1 + np.round(np.sqrt(np.clip(meters, 0, MAX_M) / MAX_M) * 254), 0).astype(np.uint8)

    OUT_BIN.write_bytes(code.tobytes() + region.tobytes())
    OUT_META.write_text(json.dumps({
        "source": "AWS Terrain Tiles (Terrarium z8; Korea mostly SRTM, public domain) — Mapzen/Tilezen",
        "attribution": "지형: AWS Terrain Tiles(Mapzen) · SRTM",
        "cols": cols, "rows": rows, "cell": CELL, "x0": round(x_min, 5), "north0": round(n_max, 5),
        "max_m": MAX_M, "encoding": "code 0 = 바다·국외, 표고 = ((code-1)/254)^2 × max_m; 이어서 시도 번호 0=없음, 1..17=regions",
        "regions": REGIONS,
    }, ensure_ascii=False, indent=1))
    land = int((region > 0).sum())
    print(f"{OUT_BIN} ← {OUT_BIN.stat().st_size // 1024}KB · 육지 {land}칸 · 최고 {decode(int(code.max())):.0f}m")


if __name__ == "__main__":
    main()
