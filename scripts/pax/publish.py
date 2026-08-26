"""data/cases.json을 site/data/cases.json으로 복사한다 (Pages 배포용).

복사 시 각 사례에 썸네일 파일의 mtime을 thumb_v로 스탬프한다 — 썸네일이
재생성되면 값이 바뀌어 브라우저·CDN 캐시가 자동 무효화된다(2026-08-26,
IP-AX 404 썸네일 캐시 잔존 사고의 재발 방지). 원본 data/cases.json은 불변.
"""
import json
import sys
from pathlib import Path


def sync_site_data(src: Path, dst: Path, thumbs_dir: Path = Path("site/thumbs")) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    doc = json.loads(src.read_text(encoding="utf-8"))
    for case in doc.get("cases", []):
        thumb = thumbs_dir / f"{case['id']}.jpg"
        if thumb.exists():
            case["thumb_v"] = int(thumb.stat().st_mtime)
        else:
            case.pop("thumb_v", None)
    dst.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main() -> int:
    src = Path("data/cases.json")
    dst = Path("site/data/cases.json")
    if not src.exists():
        print(f"원본 없음: {src}", file=sys.stderr)
        return 1
    sync_site_data(src, dst)
    print(f"{src} → {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
