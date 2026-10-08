"""도시 3D 지도 빌드 공용 — 도시 정의, 투영, 바이너리 형식.

모든 좌표는 도시별 로컬 미터 좌표계를 쓴다: 원점 = 도시 경계 상자의 남서쪽 모서리,
x = 동쪽(m), n = 북쪽(m). 등장방형 근사(도시 규모 50km 안에서 오차 0.1% 미만).
"""
import json
import math
import struct
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRIVATE = REPO / "data" / "private" / "city3d"  # 비공개(.gitignore): 받은 타일 캐시·원본 .bin
CACHE = PRIVATE / "cache"
OUT = PRIVATE / "build"                        # process.py·mapinfo.py 산출(원본 .bin + JSON)
SITE_DATA = REPO / "site" / "city3d" / "data"  # pack.py가 전송본(.gz.b64.txt)과 JSON만 여기로 낸다
PAX_DATA = REPO / "site" / "data"              # 행정 경계(SGIS 가공, CC BY 4.0)

MVT_Z = 14
DEM_Z = 13
TILEJSON = "https://tiles.openfreemap.org/planet"
DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
UA = "city3d-build (static 3D map demo; contact via github.com/hollobit/PAX)"

# key, 표시 이름, 경계 규칙
CITIES = [
    # 서울: 건물은 국토교통부 GIS건물통합정보(VWorld, vworld.py로 받음) — 나머지 도시는 아직 OSM(시범 후 확대)
    {"key": "seoul", "name": "서울", "region": "서울", "buildings": "vworld"},
    {"key": "busan", "name": "부산", "region": "부산"},
    {"key": "sejong", "name": "세종", "region": "세종"},
    # 2023년 편입된 군위군은 도심에서 40km 떨어진 농촌이라 제외(README에 명시) — 좌표 범위를 65km 안에 둔다
    {"key": "daegu", "name": "대구", "region": "대구", "exclude_sgg": ["군위군"]},
    {"key": "gwangyang", "name": "광양", "sgg": ("전남", "광양시")},
    {"key": "daejeon", "name": "대전", "region": "대전"},
    # 인천: 옹진군(백령도 등 서해 섬, 최대 200km 밖)은 빼고 강화·영종은 넣는다
    {"key": "incheon", "name": "인천", "region": "인천", "exclude_sgg": ["옹진군"]},
    # 제주: 본섬에서 15km 넘게 떨어진 섬(추자도)은 뺀다 — 우도·가파도·마라도는 남는다
    {"key": "jeju", "name": "제주", "region": "제주", "max_island_km": 15},
]
# 경기도는 1만㎢라 한 장으로 싣지 않고 시·군 31곳을 따로 만든다 — 3D PAX는 확대한 시·군만 받는다
GYEONGGI = {
    "가평군": "gapyeong", "고양시": "goyang", "과천시": "gwacheon", "광명시": "gwangmyeong", "광주시": "gwangju-gg",
    "구리시": "guri", "군포시": "gunpo", "김포시": "gimpo", "남양주시": "namyangju", "동두천시": "dongducheon",
    "부천시": "bucheon", "성남시": "seongnam", "수원시": "suwon", "시흥시": "siheung", "안산시": "ansan",
    "안성시": "anseong", "안양시": "anyang", "양주시": "yangju", "양평군": "yangpyeong", "여주시": "yeoju",
    "연천군": "yeoncheon", "오산시": "osan", "용인시": "yongin", "의왕시": "uiwang", "의정부시": "uijeongbu",
    "이천시": "icheon", "파주시": "paju", "평택시": "pyeongtaek", "포천시": "pocheon", "하남시": "hanam", "화성시": "hwaseong",
}
CITIES += [{"key": f"gg-{rom}", "name": name, "sgg": ("경기", name), "group": "경기"} for name, rom in GYEONGGI.items()]

M_LAT = 110574.0


def city_boundary(city):
    """[[외곽, 구멍…], …] (경도·위도) — PAX 저장소의 SGIS 가공 경계에서."""
    polys = _raw_boundary(city)
    if city.get("max_island_km"):
        # 가장 큰 땅에서 max_island_km 넘게 떨어진 섬은 뺀다(도시 범위·표고 격자가 바다로 크게 늘지 않게)
        from shapely.geometry import Polygon
        shapes = [Polygon(p[0], p[1:]) for p in polys]
        main = max(shapes, key=lambda g: g.area)
        lim = city["max_island_km"] / 111.0
        polys = [p for p, g in zip(polys, shapes) if g.distance(main) <= lim]
    return polys


def _raw_boundary(city):
    if "sgg" in city:
        region, name = city["sgg"]
        sgg = json.loads((PAX_DATA / "korea-sgg.json").read_text())["sgg"]
        return next(s["polys"] for s in sgg if s["region"] == region and s["name"] == name)
    if city.get("exclude_sgg"):
        sgg = json.loads((PAX_DATA / "korea-sgg.json").read_text())["sgg"]
        return [p for s in sgg if s["region"] == city["region"] and s["name"] not in city["exclude_sgg"]
                for p in s["polys"]]
    return json.loads((PAX_DATA / "korea-geo.json").read_text())["regions"][city["region"]]


class Frame:
    """도시 로컬 좌표계."""

    def __init__(self, lon_min, lat_min, lon_max, lat_max):
        self.lon0, self.lat0 = lon_min, lat_min
        self.lon1, self.lat1 = lon_max, lat_max
        self.m_lon = 111320.0 * math.cos(math.radians((lat_min + lat_max) / 2))
        self.width = (lon_max - lon_min) * self.m_lon
        self.height = (lat_max - lat_min) * M_LAT

    def to_local(self, lon, lat):
        return (lon - self.lon0) * self.m_lon, (lat - self.lat0) * M_LAT

    def to_lonlat(self, x, n):
        return self.lon0 + x / self.m_lon, self.lat0 + n / M_LAT

    def meta(self):
        return {"lon0": self.lon0, "lat0": self.lat0, "lon1": self.lon1, "lat1": self.lat1,
                "m_lon": self.m_lon, "m_lat": M_LAT, "width": round(self.width, 1), "height": round(self.height, 1)}


def tile_xy(lon, lat, z):
    n = 2 ** z
    return ((lon + 180) / 360 * n,
            (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)


def tile_lonlat(x, y, z):
    n = 2 ** z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat


# ---- 바이너리 형식 --------------------------------------------------------------------
# 모든 파일: 헤더 32바이트 + 본문
#   0  magic   b"C3D1"
#   4  kind    4바이트 ASCII (BLDG / LINE / MESH / DEMG)
#   8  version uint32 (1)
#  12  count   uint32 — 레코드(또는 원소) 수
#  16  stride  uint32 — 레코드 한 개의 바이트(가변 길이 파일은 0)
#  20  length  uint32 — 본문 바이트 수
#  24  crc32   uint32 — 본문 CRC32
#  28  extra   uint32 — 종류별 보조 값
HEADER = struct.Struct("<4s4sIIIIII")


def write_bin(path, kind, count, stride, body, extra=0):
    body = bytes(body)
    if stride:
        assert len(body) == count * stride, (kind, count, stride, len(body))
    header = HEADER.pack(b"C3D1", kind.encode(), 1, count, stride, len(body), zlib.crc32(body) & 0xFFFFFFFF, extra)
    Path(path).write_bytes(header + body)
    return len(header) + len(body)


def read_bin(path):
    raw = Path(path).read_bytes()
    magic, kind, ver, count, stride, length, crc, extra = HEADER.unpack_from(raw)
    body = raw[HEADER.size:]
    if magic != b"C3D1" or ver != 1:
        raise ValueError("형식 아님")
    if len(body) != length:
        raise ValueError(f"길이 불일치 {len(body)} != {length}")
    if stride and count * stride != length:
        raise ValueError(f"레코드 수 불일치 {count}×{stride} != {length}")
    if zlib.crc32(body) & 0xFFFFFFFF != crc:
        raise ValueError("CRC 불일치")
    return {"kind": kind.decode(), "count": count, "stride": stride, "extra": extra, "body": body}
