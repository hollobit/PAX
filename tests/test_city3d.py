"""도시 3D 지도(site/city3d) 자료 검증 — 바이너리 형식(레코드 수·길이·CRC), 도시별 산출물의 일관성,
브라우저 읽기 코드, 실제 지도 정보(mapinfo.json) 좌표. 공개되는 전송본(.gz.b64.txt)을 풀어서 검사한다."""
import base64
import gzip
import json
import shutil
import struct
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "city3d"))
from common import CITIES, HEADER, read_bin, write_bin  # noqa: E402

DATA = ROOT / "site" / "city3d" / "data"


def raw(key, name):
    """공개 전송본을 원래 .bin 바이트로"""
    return gzip.decompress(base64.b64decode((DATA / key / f"{name}.gz.b64.txt").read_bytes()))


def read_packed(key, name, tmp_path):
    p = tmp_path / f"{key}-{name}"
    p.write_bytes(raw(key, name))
    return read_bin(p)
FILES = {"buildings.bin": "BLDG", "roads.bin": "LINE", "waterways.bin": "LINE", "water.bin": "MESH",
         "green.bin": "MESH", "terrain.bin": "DEMG"}


# ---- 형식 --------------------------------------------------------------------------
def test_roundtrip(tmp_path):
    p = tmp_path / "x.bin"
    write_bin(p, "BLDG", 2, 16, bytes(range(32)))
    r = read_bin(p)
    assert r["kind"] == "BLDG" and r["count"] == 2 and r["body"] == bytes(range(32))


@pytest.mark.parametrize("damage", ["truncate", "flip", "count"])
def test_tampering_is_detected(tmp_path, damage):
    p = tmp_path / "x.bin"
    write_bin(p, "BLDG", 2, 16, bytes(range(32)))
    raw = bytearray(p.read_bytes())
    if damage == "truncate":
        raw = raw[:-1]
    elif damage == "flip":
        raw[-1] ^= 0xFF
    else:
        struct.pack_into("<I", raw, 12, 3)  # 레코드 수만 바꿈
    p.write_bytes(bytes(raw))
    with pytest.raises(ValueError):
        read_bin(p)


# ---- 도시별 산출물 ----------------------------------------------------------------------
@pytest.fixture(scope="module", params=[c["key"] for c in CITIES])
def city(request):
    key = request.param
    return key, json.loads((DATA / key / "meta.json").read_text())


def test_files_match_meta(city, tmp_path):
    key, meta = city
    for name, kind in FILES.items():
        r = read_packed(key, name, tmp_path)
        assert r["kind"] == kind
        assert len(raw(key, name)) == meta["files"][name]["bytes"]
        assert struct.unpack_from("<I", raw(key, name), 24)[0] == meta["files"][name]["crc32"]


def test_buildings_are_sane(city, tmp_path):
    key, meta = city
    r = read_packed(key, "buildings.bin", tmp_path)
    # 경기 북부·동부 군은 OSM 건물 입력이 적다(연천·여주·동두천 1,000채 미만) — 자료 자체의 차이라 기준을 나눈다
    assert r["count"] == meta["counts"]["buildings"] > (500 if key.startswith("gg-") else 1000)
    w, h = meta["frame"]["width"], meta["frame"]["height"]
    est = 0
    for (x, n, bw, bd, ang, flags, hh, h0, area) in struct.iter_unpack("<HHHHBBHHH", r["body"]):
        assert 0 <= x <= w + 1 and 0 <= n <= h + 1
        assert bw >= 10 and bd >= 10          # 1m 이상(0.1m 단위)
        assert hh > h0 or (hh == h0 == 0)
        if flags & 3:                          # 4(건물통합정보 출처)·8(층수 환산)은 추정이 아니다
            est += 1
            assert hh == 50 or flags & 2       # 추정 = 기본값 5m, 또는 시작 높이보다 낮아 보정한 경우
        if flags & 8:
            assert flags & 4 and hh % 30 == 0  # 층수 환산은 건물통합정보에서만, 3m 배수
    assert est == meta["counts"]["estimated_height"]


def test_lines_and_meshes_are_well_formed(city, tmp_path):
    key, meta = city
    for name in ("roads.bin", "waterways.bin"):
        r = read_packed(key, name, tmp_path)
        body, o, pts = r["body"], 0, 0
        for _ in range(r["count"]):
            cls, flags, n = struct.unpack_from("<BBH", body, o)
            assert n >= 2 and cls > 0
            o += 4 + n * 4
            pts += n
        assert o == len(body) and pts == r["extra"]
    for name in ("water.bin", "green.bin"):
        r = read_packed(key, name, tmp_path)
        nv, nt = struct.unpack_from("<II", r["body"], 0)
        assert nt == r["count"]
        off = 8 + nv * 4
        if r["extra"] == 1:
            off += nv + (4 - nv % 4) % 4
        idx = struct.unpack_from(f"<{nt * 3}I", r["body"], off)
        assert off + nt * 12 == len(r["body"])
        assert not idx or max(idx) < nv


def test_terrain_grid(city, tmp_path):
    key, meta = city
    r = read_packed(key, "terrain.bin", tmp_path)
    t = meta["terrain"]
    assert r["extra"] == t["cols"] and r["count"] == t["cols"] * t["rows"]
    assert t["max_m"] > 50  # 모든 도시·시군에 언덕 이상이 있다(서울 836m, 제주 한라산 1,934m …)


def test_landmarks_have_positions_inside_frame(city):
    key, meta = city
    for lm in meta["landmarks"]:
        assert 0 <= lm["x"] <= meta["frame"]["width"] and 0 <= lm["n"] <= meta["frame"]["height"], lm


# ---- 브라우저 읽기 코드(site/city3d/js/binary.js)를 node로 --------------------------------------------
NODE = """
import fs from 'fs';
import zlib from 'zlib';
const mod = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync('site/city3d/js/binary.js', 'utf8')));
const key = process.argv[1];
const meta = JSON.parse(fs.readFileSync(`site/city3d/data/${key}/meta.json`, 'utf8'));
const load = (n) => { const b = zlib.gunzipSync(Buffer.from(fs.readFileSync(`site/city3d/data/${key}/${n}.gz.b64.txt`, 'utf8').trim(), 'base64')); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const B = mod.readC3D(load('buildings.bin'), 'BLDG', meta.files['buildings.bin']);
const b = mod.decodeBuildings(B);
const roads = mod.decodeLines(mod.readC3D(load('roads.bin'), 'LINE', meta.files['roads.bin']));
const water = mod.decodeMesh(mod.readC3D(load('water.bin'), 'MESH', meta.files['water.bin']));
const green = mod.decodeMesh(mod.readC3D(load('green.bin'), 'MESH', meta.files['green.bin']));
const dem = mod.decodeDem(mod.readC3D(load('terrain.bin'), 'DEMG', meta.files['terrain.bin']), meta.terrain);
const errs = [];
const bad = load('buildings.bin'); new Uint8Array(bad)[100] ^= 0xff;
try { mod.readC3D(bad, 'BLDG', meta.files['buildings.bin']); } catch (e) { errs.push(e.message); }
const cut = load('buildings.bin').slice(0, -16);
try { mod.readC3D(cut, 'BLDG', meta.files['buildings.bin']); } catch (e) { errs.push(e.message); }
console.log(JSON.stringify({ n: b.n, roads: roads.length, waterTris: water.nt, greenTris: green.nt, dem: [dem.cols, dem.rows], errs }));
"""


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_browser_reader_accepts_real_files_and_rejects_damage(city):
    key, meta = city
    out = subprocess.run(["node", "--input-type=module", "-e", NODE, key], cwd=ROOT, capture_output=True, text=True, check=True)
    res = json.loads(out.stdout)
    c = meta["counts"]
    assert res["n"] == c["buildings"] and res["roads"] == c["roads"]
    assert res["waterTris"] == c["water_triangles"] and res["greenTris"] == c["green_triangles"]
    assert res["dem"] == [meta["terrain"]["cols"], meta["terrain"]["rows"]]
    assert len(res["errs"]) == 2 and "CRC32" in res["errs"][0] and "길이" in res["errs"][1]


# ---- 배포 전송본(gzip+base64) -----------------------------------------------------------
def test_packed_transport_sizes_match_meta(city):
    key, meta = city
    for name, info in meta["files"].items():
        assert (DATA / key / f"{name}.gz.b64.txt").stat().st_size == info["packed_bytes"]


def test_only_packed_and_json_are_published():
    """원본 .bin·캐시는 비공개 빌드 폴더에만 — site에는 전송본과 JSON만"""
    names = {p.name for p in DATA.rglob("*") if p.is_file()}
    assert all(n.endswith((".gz.b64.txt", ".json")) for n in names), names


# ---- 실제 지도 정보(mapinfo.json) ↔ 3D 좌표 ------------------------------------------------------
KNOWN = {  # (도시, 종류, 이름, 실제 위도, 경도) — 공개 지도에서 확인한 대략 위치, 허용 오차 1.5km
    "seoul": ("city", "서울특별시", 37.5666, 126.9782),
    "busan": ("airport", "김해국제공항", 35.1795, 128.9382),
    "daegu": ("airport", "대구국제공항", 35.8941, 128.6589),
    "daejeon": ("station", "대전역", 36.3323, 127.4346),
}


def _lonlat(meta, x, n):
    f = meta["frame"]
    return f["lon0"] + x / f["m_lon"], f["lat0"] + n / f["m_lat"]


def test_mapinfo_matches_city(city):
    key, meta = city
    info = json.loads((DATA / key / "mapinfo.json").read_text())
    assert info["key"] == key and info["snapshot"] == meta["snapshot"]
    assert info["districts"], "구·군 경계가 없음"
    w, h = meta["frame"]["width"], meta["frame"]["height"]
    for d in info["districts"]:
        for ring in d["polys"]:
            assert len(ring) >= 4 and ring[0] == ring[-1]
            assert all(-1 <= x <= w + 1 and -1 <= n <= h + 1 for x, n in ring)
    kinds = {}
    for r in info["labels"]:
        assert r["name"] and 0 <= r["x"] <= w and 0 <= r["n"] <= h, r
        kinds[r["k"]] = kinds.get(r["k"], 0) + 1
    assert {k: v for k, v in info["counts"].items() if k != "district"} == {k: kinds.get(k, 0) for k in info["counts"] if k != "district"}
    small = key.startswith("gg-")  # 경기 군·작은 시는 동네·도로 이름이 적다
    assert kinds.get("quarter", 0) >= (3 if small else 20) and kinds.get("road", 0) >= (10 if small else 50)


@pytest.mark.parametrize("key", list(KNOWN))
def test_known_places_land_where_they_are(key):
    import math
    meta = json.loads((DATA / key / "meta.json").read_text())
    info = json.loads((DATA / key / "mapinfo.json").read_text())
    kind, name, lat, lon = KNOWN[key]
    hit = next(r for r in info["labels"] if r["k"] == kind and r["name"] == name)
    lo, la = _lonlat(meta, hit["x"], hit["n"])
    dist = math.hypot((lo - lon) * 111320 * math.cos(math.radians(lat)), (la - lat) * 110574)
    assert dist < 1500, (name, la, lo, dist)


GEO_NODE = """
import fs from 'fs';
const mod = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync('site/city3d/js/geo.js', 'utf8')));
const out = {};
for (const key of ['seoul', 'busan']) {
  const info = JSON.parse(fs.readFileSync(`site/city3d/data/${key}/mapinfo.json`, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(`site/city3d/data/${key}/meta.json`, 'utf8'));
  const loc = mod.createLocator(info);
  const probe = (lon, lat) => { const [x, n] = mod.toLocal(meta.frame, lon, lat); return [loc.district(x, n), loc.nearestQuarter(x, n)?.name, mod.toLonLat(meta.frame, x, n)]; };
  out[key] = key === 'seoul' ? [probe(126.9769, 37.5759), probe(127.0276, 37.4979), probe(126.9249, 37.5256)] : [probe(129.1604, 35.1587), probe(129.0403, 35.1150)];
}
console.log(JSON.stringify(out));
"""


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_locator_names_real_districts():
    """광화문·강남역·여의도·해운대해수욕장·부산역 좌표가 제 구로 조회되고, 경위도 왕복이 보존된다"""
    out = json.loads(subprocess.run(["node", "--input-type=module", "-e", GEO_NODE], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    assert [r[0] for r in out["seoul"]] == ["종로구", "강남구", "영등포구"]
    assert [r[0] for r in out["busan"]] == ["해운대구", "동구"]
    assert abs(out["seoul"][0][2][0] - 126.9769) < 1e-9 and abs(out["seoul"][0][2][1] - 37.5759) < 1e-9
    assert all(r[1] for r in out["seoul"] + out["busan"])  # 가까운 동네 이름이 잡힌다


# ---- 3D PAX 안에서 펼치기: 도시 범위·청사 찾기·사례 → 도시 -------------------------------------
def test_city_index_has_bbox_matching_meta():
    """3D PAX는 자료를 받기 전에 cities.json의 경위도 범위로 '지금 어느 도시 위인가'를 판정한다"""
    index = json.loads((DATA / "cities.json").read_text())
    assert set(index["cities"]) == {c["key"] for c in CITIES}
    for key, c in index["cities"].items():
        f = json.loads((DATA / key / "meta.json").read_text())["frame"]
        assert c["bbox"] == [f["lon0"], f["lat0"], f["lon1"], f["lat1"]]
        assert c["packed_bytes"] == sum((DATA / key / f"{n}.gz.b64.txt").stat().st_size for n in FILES)
        # 3D PAX가 "어느 도시 위인가"를 가리는 경계 다각형 — 경위도, 상자 안
        assert c["outline"] and all(len(r) >= 3 for r in c["outline"])
        w, s_, e, n = c["bbox"]
        assert all(w - 0.01 <= x <= e + 0.01 and s_ - 0.01 <= y <= n + 0.01 for r in c["outline"] for x, y in r)


SEAT_NODE = """
import fs from 'fs';
const geo = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync('site/city3d/js/geo.js', 'utf8')));
const out = {};
for (const [key, place, withLoc] of [['gwangyang', '광양시', true], ['busan', '연제구', true], ['seoul', '중구', true],
    ['sejong', '세종시', true], ['seoul', '서울', false], ['busan', '부산', false], ['daegu', '수성구', true],
    ['daejeon', '유성구', true], ['daejeon', '대전', false]]) {
  const info = JSON.parse(fs.readFileSync(`site/city3d/data/${key}/mapinfo.json`, 'utf8'));
  const loc = geo.createLocator(info);
  const s = geo.seatOf(info, place, withLoc ? loc : null);
  out[`${key}/${place}`] = s && { name: s.name, gu: loc.district(s.x, s.n) };
}
console.log(JSON.stringify(out));
"""


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_seat_of_finds_the_real_hall_inside_the_district():
    """시군구까지만 아는 사례는 그 청사 자리에 선다 — 이름 앞머리만 같은 다른 구 청사(중구 → 중랑구청)로 가지 않는다"""
    out = json.loads(subprocess.run(["node", "--input-type=module", "-e", SEAT_NODE], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    assert out["gwangyang/광양시"]["name"] == "광양시청"
    assert out["busan/연제구"] == {"name": "연제구청", "gu": "연제구"}
    assert out["daegu/수성구"] == {"name": "수성구청", "gu": "수성구"}
    assert out["sejong/세종시"]["name"] == "세종특별자치시청"
    assert out["seoul/서울"]["name"] == "서울특별시청" and out["busan/부산"]["name"] == "부산광역시청"
    assert out["daejeon/유성구"]["gu"] == "유성구"
    assert out["daejeon/대전"]["name"] == "대전광역시청"
    assert out["seoul/중구"]["gu"] == "중구"  # 청사 이름표가 없으면 중구 이름표 자리 — 어느 쪽이든 중구 안


CITYKEY_NODE = """
import fs from 'fs';
// 파일 주소로 불러오면 node가 상대 import(?v= 스탬프 포함)를 그대로 푼다 — 코드를 고쳐 끼우지 않는다
const mod = await import(new URL('site/pax3d-data.js', 'file://' + process.cwd() + '/').href);
const k = mod.cityKeyOf;
console.log(JSON.stringify([
  k({ place: '서울' }), k({ place: '부산', sgg: { name: '연제구' } }), k({ place: '세종' }), k({ place: '대구' }),
  k({ place: '대구', sgg: { name: '군위군' } }), k({ place: '전남', sgg: { name: '광양시' } }), k({ place: '전남', sgg: { name: '순천시' } }),
  k({ place: '경기' }), k({ place: '공직 현장 섬' }), k(null), k({ place: '대전', sgg: { name: '유성구' } }),
  k({ place: '인천', sgg: { name: '연수구' } }), k({ place: '인천', sgg: { name: '옹진군' } }), k({ place: '제주' }),
  k({ place: '경기', sgg: { name: '수원시' } }), k({ place: '경기', sgg: { name: '광주시' } }),
]));
console.log(JSON.stringify(mod.GYEONGGI_CITY3D));
"""


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_case_location_maps_to_city():
    lines = subprocess.run(["node", "--input-type=module", "-e", CITYKEY_NODE], cwd=ROOT, capture_output=True, text=True, check=True).stdout.splitlines()
    out, gg = json.loads(lines[0]), json.loads(lines[1])
    assert out == ["seoul", "busan", "sejong", "daegu", None, "gwangyang", None, "gg-suwon", None, None, "daejeon",
                   "incheon", None, "jeju", "gg-suwon", "gg-gwangju-gg"]
    from common import GYEONGGI
    assert gg == GYEONGGI  # 3D PAX 표와 빌드 표가 같다


# ---- 랜드마크(바로 가기·랜드마크 비행) -------------------------------------------------------
def _landmark_table():
    """scripts/city3d/process.py의 LANDMARKS 표를 무거운 의존성 없이 읽는다(ast)"""
    import ast
    tree = ast.parse((ROOT / "scripts" / "city3d" / "process.py").read_text())
    node = next(n for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "LANDMARKS")
    return ast.literal_eval(node.value)


def test_verified_landmarks_are_near_their_real_place(city):
    """OSM 지점으로 표시한 랜드마크는 이름이 후보 중 하나이고 실제 위치 2km 안 — 같은 이름 식당·정류장에 끌려가지 않았다"""
    import math
    key, meta = city
    table = {label: (names, ll) for label, names, ll in _landmark_table().get(key, [])}
    f = meta["frame"]
    verified = [l for l in meta["landmarks"] if l["source"] == "OSM POI"]
    assert len(verified) >= (1 if key.startswith("gg-") else 4), "비행할 랜드마크가 너무 적다"
    for l in verified:
        assert 0 <= l["x"] <= f["width"] and 0 <= l["n"] <= f["height"]
        if l.get("rule") != "table":
            continue  # 좌표를 적지 않은 항목(경기 시·군 표·시군청·최고봉)은 "이름이 같고 경계 안"으로 골랐다
        names, (lon, lat) = table[l["name"]]
        assert l["osm_name"] in names
        ex, en = (lon - f["lon0"]) * f["m_lon"], (lat - f["lat0"]) * f["m_lat"]
        assert math.hypot(l["x"] - ex, l["n"] - en) <= 2000, l


FLIGHT_NODE = """
import fs from 'fs';
const src = fs.readFileSync('site/city3d/js/flight.js', 'utf8').replace(/^(import .*|export \{[^}]*\} from .*)$/gm, '');
const mod = await import('data:text/javascript,' + encodeURIComponent(src));
const out = {};
for (const key of process.argv.slice(1)) {
  const meta = JSON.parse(fs.readFileSync(`site/city3d/data/${key}/meta.json`, 'utf8'));
  const stops = mod.flightStops(meta.landmarks);
  out[key] = { names: stops.map((s) => s.name), sources: [...new Set(stops.map((s) => s.source))],
    total: meta.landmarks.filter((l) => l.source === 'OSM POI').length };
}
console.log(JSON.stringify(out));
"""


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_flight_visits_every_verified_landmark_once():
    keys = [c["key"] for c in CITIES]
    out = json.loads(subprocess.run(["node", "--input-type=module", "-e", FLIGHT_NODE, *keys], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    for key in keys:
        r = out[key]
        assert r["sources"] == ["OSM POI"], key          # 대략 좌표로 둔 곳은 날지 않는다
        assert len(r["names"]) == len(set(r["names"])) == r["total"]
