"""3D PAX 실제 지형 — 커밋된 수치표고 격자(korea-dem)의 형식·시도 판정·표고 범위를 점검한다."""
import json
from pathlib import Path

from build_korea_dem import REGIONS, decode, encode

DATA = Path(__file__).resolve().parent.parent / "site" / "data"


def load():
    meta = json.loads((DATA / "korea-dem.json").read_text())
    raw = (DATA / "korea-dem.bin").read_bytes()
    n = meta["rows"] * meta["cols"]
    return meta, raw[:n], raw[n:]


def test_encoding_round_trips_within_quantization():
    assert encode(0) == 1 and decode(0) == 0.0
    for m in (5, 120, 800, 1947):
        assert abs(decode(encode(m)) - m) <= max(8, m * 0.02)


def test_binary_matches_metadata():
    meta, code, region = load()
    assert len(code) == len(region) == meta["rows"] * meta["cols"]
    assert meta["regions"] == REGIONS


def test_every_region_has_land_and_sea_has_no_height():
    meta, code, region = load()
    counts = [0] * 18
    for c, r in zip(code, region):
        counts[r] += 1
        assert (r == 0) == (c == 0)          # 육지 칸에만 표고 코드가 있다
    assert all(counts[i] > 50 for i in range(1, 18)), counts


def test_relief_reaches_mountain_heights():
    _, code, _ = load()
    assert decode(max(code)) > 1400          # 한라산·설악산·지리산 줄기
    assert sum(1 for c in code if c and decode(c) > 800) > 300
