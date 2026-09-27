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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT, SITE_DATA  # noqa: E402

total_raw = total_packed = 0
SITE_DATA.mkdir(parents=True, exist_ok=True)
shutil.copy2(OUT / "cities.json", SITE_DATA / "cities.json")
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
print(f"원본 {total_raw / 1048576:.1f}MB → 전송본 {total_packed / 1048576:.1f}MB (gzip+base64)")
