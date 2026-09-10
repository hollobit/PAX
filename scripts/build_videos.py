#!/usr/bin/env python3
"""오픈채팅·Threads에서 공유된 동영상을 모아 site/data/videos.json으로 낸다.

수집 원본(data/raw/)은 비공개다. 여기서 밖으로 내보내는 것은 **공개된 영상 자체의 정보**
(영상 id·제목·채널·공유 시점·공유 횟수)뿐이며, 메시지 본문과 공유한 사람은 담지 않는다.
AGENTS.md §3-2(원문·닉네임 비공개)를 이 경계로 지킨다.

공유 횟수는 메시지 id 기준으로 센다 — 워치독이 2일 창을 30분마다 덤프하므로 같은 메시지가
여러 raw 파일에 겹쳐 있고, 파일 단위로 세면 한 번 올라온 영상이 수십 번 추천된 것처럼 보인다.

제목은 YouTube oEmbed로 한 번만 받아 data/private/video_titles.json에 캐시한다(비공개 경로).
비공개·삭제된 영상은 제목을 못 받으므로 목록에서 빼고 건수만 보고한다 — 죽은 링크를 싣지 않는다.
"""
from __future__ import annotations

import glob
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_GLOB = os.path.join(ROOT, "data", "raw", "*.json")
CACHE = os.path.join(ROOT, "data", "private", "video_titles.json")
OUT = os.path.join(ROOT, "site", "data", "videos.json")

YT = re.compile(
    r"https?://(?:www\.|m\.)?(?:"
    r"youtube\.com/watch\?[^\s\)\]\>\"']*v=([A-Za-z0-9_-]{11})"
    r"|youtu\.be/([A-Za-z0-9_-]{11})"
    r"|youtube\.com/shorts/([A-Za-z0-9_-]{11})"
    r")"
)


def scan() -> dict[str, dict]:
    """raw 아카이브 전체에서 영상별 공유 이력을 모은다(메시지 id 기준 중복 제거)."""
    seen: set[tuple] = set()
    vids: dict[str, dict] = defaultdict(lambda: {"shares": 0, "dates": set(), "sources": set()})
    for path in sorted(glob.glob(RAW_GLOB)):
        try:
            rows = json.load(open(path, encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rows, list):
            continue
        source = "kakao" if "kakao" in os.path.basename(path) else "threads"
        for msg in rows:
            if not isinstance(msg, dict):
                continue
            text = msg.get("text") or msg.get("raw_text") or ""
            found = {m.group(1) or m.group(2) or m.group(3) for m in YT.finditer(text)}
            if not found:
                continue
            mid = msg.get("id")
            # id가 없는 원본(Threads 메모 등)은 본문 앞머리로 동일 메시지를 가린다.
            key = ("id", mid) if mid else ("txt", text[:80])
            if key in seen:
                continue
            seen.add(key)
            when = (msg.get("timestamp") or msg.get("date") or "")[:10]
            for vid in found:
                v = vids[vid]
                v["shares"] += 1
                v["sources"].add(source)
                if when:
                    v["dates"].add(when)
    return vids


def load_cache() -> dict:
    try:
        return json.load(open(CACHE, encoding="utf-8"))
    except Exception:
        return {}


def fetch_meta(vid: str) -> dict | None:
    """oEmbed로 제목·채널을 받는다. 실패하면 None(비공개·삭제·지역제한)."""
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"
    try:
        out = subprocess.run(
            ["/usr/bin/curl", "-s", "--max-time", "20", url],
            capture_output=True, text=True, timeout=30,
        ).stdout
        data = json.loads(out)
    except Exception:
        return None
    title = (data.get("title") or "").strip()
    if not title:
        return None
    return {"title": title, "channel": (data.get("author_name") or "").strip()}


def main() -> int:
    vids = scan()
    cache = load_cache()
    dead = 0
    items = []
    for vid, v in vids.items():
        meta = cache.get(vid)
        if meta is None:
            meta = fetch_meta(vid)
            cache[vid] = meta  # 실패도 기록해 매번 다시 두드리지 않는다
        if not meta:
            dead += 1
            continue
        dates = sorted(v["dates"])
        items.append({
            "id": vid,
            "title": meta["title"],
            "channel": meta.get("channel", ""),
            "url": f"https://www.youtube.com/watch?v={vid}",
            "thumb": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
            "shares": v["shares"],
            "first_shared": dates[0] if dates else "",
            "last_shared": dates[-1] if dates else "",
            "sources": sorted(v["sources"]),
        })

    # 최근 공유순 — 방에서 지금 도는 것이 위로 온다. 같은 날이면 재공유가 많은 쪽이 먼저.
    # 동점 순서를 id로 고정한다(순서가 흔들리면 내용이 같아도 파일이 다시 쓰인다).
    items.sort(key=lambda x: (x["last_shared"], x["shares"], x["id"]), reverse=True)

    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    payload = {
        "updated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(items),
        "videos": items,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"site/data/videos.json ← 영상 {len(items)}편 "
          f"(재공유 2회 이상 {sum(1 for i in items if i['shares'] >= 2)}편 · 조회 불가 제외 {dead}편)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
