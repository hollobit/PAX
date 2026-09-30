"""썸네일 WebP 파생본 — site/thumbs/<id>.jpg 옆에 <id>.webp를 만든다.

JPEG가 원본이다(공유 미리보기·구형 브라우저용). 카드와 3D 목록은 <picture>로 WebP를 먼저 쓰는데,
<picture>는 파일이 있는지가 아니라 형식을 보고 고르므로 JPEG마다 WebP가 반드시 있어야 한다.
카드 폭(약 280px)의 2배율을 덮는 560px·화질 72에서 JPEG 대비 약 1/4 크기다.
make_thumbs.sh 끝과 pax.publish가 부르므로, 썸네일을 어떤 길로 넣든 게시 전에 짝이 맞춰진다.
의존: Pillow(WebP 지원 빌드) — build_korea_dem.py와 같은 로컬 파이썬 환경.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

WEBP_WIDTH = 560
WEBP_QUALITY = 72


def _convert(jpg: Path, webp: Path) -> None:
    with Image.open(jpg) as im:
        rgb = im.convert("RGB")
    if rgb.width > WEBP_WIDTH:
        rgb = rgb.resize((WEBP_WIDTH, round(rgb.height * WEBP_WIDTH / rgb.width)), Image.LANCZOS)
    tmp = webp.with_suffix(".webp.tmp")
    try:
        rgb.save(tmp, "WEBP", quality=WEBP_QUALITY, method=6)
        tmp.replace(webp)  # 반쯤 쓴 파일이 배포되지 않게 원자적으로 교체
    finally:
        tmp.unlink(missing_ok=True)  # 실패해도 site/thumbs에 .tmp가 남아 커밋되지 않게


def sync_webp(thumbs_dir: Path) -> tuple[int, int]:
    """JPEG보다 오래됐거나 없는 WebP를 만들고, 짝 없는 WebP는 지운다. (생성, 유지) 건수."""
    thumbs_dir = Path(thumbs_dir)
    made = kept = 0
    jpg_stems = set()
    for jpg in sorted(thumbs_dir.glob("*.jpg")):
        if not jpg.is_file():
            continue
        jpg_stems.add(jpg.stem)
        webp = jpg.with_suffix(".webp")
        if webp.exists() and webp.stat().st_mtime >= jpg.stat().st_mtime:
            kept += 1
            continue
        _convert(jpg, webp)
        made += 1
    for webp in thumbs_dir.glob("*.webp"):
        if webp.stem not in jpg_stems:
            webp.unlink()
    return made, kept


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("site/thumbs")
    made, kept = sync_webp(target)
    print(f"WebP 생성 {made}건, 기존 유지 {kept}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
