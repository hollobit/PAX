"""data/cases.json을 site/data/cases.json으로 복사한다 (Pages 배포용)."""
import shutil
import sys
from pathlib import Path


def sync_site_data(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


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
