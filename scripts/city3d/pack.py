"""배포용 전송 인코딩 — Claude sites(Artifact)는 임의 바이너리(application/octet-stream)를 내보내지 않는다.
각 .bin을 gzip 압축 → base64 텍스트(.gz.b64.txt)로 바꿔 둔다. 브라우저는 base64를 풀고 DecompressionStream('gzip')으로
원래 바이트를 되살린 뒤 헤더·레코드 수·길이·CRC32를 그대로 검증한다(검증 대상은 원래 .bin 바이트).
    python3 scripts/city3d/pack.py

GitHub Pages도 같은 전송본을 쓴다 — 배포처가 달라도 브라우저 코드·검증 경로가 하나로 유지된다.
원본 .bin은 비공개 빌드 폴더(data/private/city3d/build)에만 두고, site에는 전송본과 JSON만 복사한다.
"""
import base64
import gzip
import json
import shutil
import sys
from pathlib import Path

from common import CITIES, OUT, SITE_DATA  # noqa: E402

GROUPS = {c["key"]: c["group"] for c in CITIES if c.get("group")}


def outline_lonlat(meta, step_m=250):
    """도시 경계(로컬 m) → 경위도, 250m보다 가까운 점은 건너뛴다 — 3D PAX가 목표점이 어느 시·군 안인지 가린다
    (경기 시·군·서울·인천은 경계 상자가 서로 겹쳐 상자만으로는 고를 수 없다)."""
    f = meta["frame"]
    rings = []
    for ring in meta["outline"]:
        kept = [ring[0]]
        for x, n in ring[1:]:
            if (x - kept[-1][0]) ** 2 + (n - kept[-1][1]) ** 2 >= step_m * step_m:
                kept.append([x, n])
        if len(kept) >= 3:
            rings.append([[round(f["lon0"] + x / f["m_lon"], 5), round(f["lat0"] + n / f["m_lat"], 5)] for x, n in kept])
    return rings

total_raw = total_packed = 0
SITE_DATA.mkdir(parents=True, exist_ok=True)
index = json.loads((OUT / "cities.json").read_text())
for meta_path in sorted(OUT.glob("*/meta.json")):
    meta = json.loads(meta_path.read_text())
    dst = SITE_DATA / meta_path.parent.name
    dst.mkdir(exist_ok=True)
    for name in meta["files"]:
        raw = (meta_path.parent / name).read_bytes()
        packed = base64.b64encode(gzip.compress(raw, 9, mtime=0))
        (dst / f"{name}.gz.b64.txt").write_bytes(packed)
        meta["files"][name]["packed_bytes"] = len(packed)
        total_raw += len(raw)
        total_packed += len(packed)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    shutil.copy2(meta_path, dst / "meta.json")
    shutil.copy2(meta_path.parent / "mapinfo.json", dst / "mapinfo.json")
    # 3D PAX가 도시 자료를 받기 전에 "지금 어느 도시 위인가"를 알도록 경위도 범위·전송 크기를 목록에 싣는다
    f = meta["frame"]
    index["cities"][dst.name] |= {"bbox": [f["lon0"], f["lat0"], f["lon1"], f["lat1"]],
                                  "packed_bytes": sum(v["packed_bytes"] for v in meta["files"].values()),
                                  "outline": outline_lonlat(meta), **({"group": GROUPS[dst.name]} if dst.name in GROUPS else {})}
(SITE_DATA / "cities.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
print(f"원본 {total_raw / 1048576:.1f}MB → 전송본 {total_packed / 1048576:.1f}MB (gzip+base64)")
