"""data/cases.json을 site/data/cases.json으로 복사한다 (Pages 배포용).

복사 시 각 사례에 썸네일 파일의 mtime을 thumb_v로 스탬프한다 — 썸네일이
재생성되면 값이 바뀌어 브라우저·CDN 캐시가 자동 무효화된다(2026-08-26,
IP-AX 404 썸네일 캐시 잔존 사고의 재발 방지). 원본 data/cases.json은 불변.

같은 자리에 목록용 경량판(cases-lite.json)도 쓴다 — 챔피언·갭맵·플레이북은 사례의 id·제목·
기관·유형·지역만 읽으므로, 요약·링크까지 담은 전체 사본(gzip 약 137KB)을 받을 까닭이 없다.
"""
import json
import sys
from pathlib import Path

from pax.jsonio import write_json
from pax.thumbs import sync_webp


LITE_FIELDS = ("id", "title", "org", "org_type", "region")


def write_lite(doc: dict, dst: Path) -> None:
    """목록용 필드만 남긴 사본을 쓴다. doc은 바꾸지 않는다."""
    lite = {k: v for k, v in doc.items() if k != "cases"}
    lite["cases"] = [{k: c[k] for k in LITE_FIELDS if k in c} for c in doc.get("cases", [])]
    write_json(dst, lite)


def sync_site_data(src: Path, dst: Path, thumbs_dir: Path = Path("site/thumbs")) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    doc = json.loads(src.read_text(encoding="utf-8"))
    for case in doc.get("cases", []):
        thumb = thumbs_dir / f"{case['id']}.jpg"
        if thumb.exists():
            case["thumb_v"] = int(thumb.stat().st_mtime)
        else:
            case.pop("thumb_v", None)
    write_json(dst, doc)


def main() -> int:
    src = Path("data/cases.json")
    dst = Path("site/data/cases.json")
    if not src.exists():
        print(f"원본 없음: {src}", file=sys.stderr)
        return 1
    sync_site_data(src, dst)
    write_lite(json.loads(src.read_text(encoding="utf-8")), dst.with_name("cases-lite.json"))
    # 카드는 WebP를 먼저 쓰는데 <picture>는 없는 WebP에서 JPEG로 물러나지 않는다 — 게시 전에 짝을 맞춘다
    made, _ = sync_webp(Path("site/thumbs"))
    print(f"{src} → {dst} (+ cases-lite.json, WebP 생성 {made}건)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
