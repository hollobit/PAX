#!/usr/bin/env python3
"""오픈채팅·Threads에서 공유된 뉴스 기사를 모아 site/data/news.json으로 낸다.

수집 원본(data/raw/)은 비공개다. 밖으로 내보내는 것은 **기사 자체의 정보**
(주소·제목·매체·발행일·공유 시점·공유 횟수)뿐이며, 메시지 본문과 공유한 사람은 담지 않는다.

기사 판별을 매체 목록으로 하지 않는 이유: 실제로 공유된 호스트가 300종을 넘고 지역지·전문지가
장기 꼬리를 이룬다. 목록을 손으로 관리하면 반드시 빠진다. 대신 **페이지를 열어 기사 표지를 본다** —
`og:type=article`이거나 발행시각 메타가 있으면 기사로 본다. 이 방법은 죽은 링크와 접힌 링크도
같은 자리에서 걸러 준다(제목을 못 받으면 목록에 넣지 않는다).

공유 횟수는 메시지 id 기준이다 — 워치독이 2일 창을 30분마다 덤프하므로 파일 단위로 세면 부풀려진다.
판별·제목 결과는 data/private/news_meta.json(비공개)에 캐시해 매번 다시 두드리지 않는다.
"""
from __future__ import annotations

import concurrent.futures
import datetime
import glob
import html
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_GLOB = os.path.join(ROOT, "data", "raw", "*.json")
CACHE = os.path.join(ROOT, "data", "private", "news_meta.json")
OUT = os.path.join(ROOT, "site", "data", "news.json")

URL_RE = re.compile(r"https?://[^\s\)\]\>\"'`]+")

# 기사일 리 없는 곳은 열어 보기 전에 뺀다 — 아카이브가 따로 다루거나(사례·영상),
# 성격이 분명히 다른 곳(코드 호스팅·SNS·문서 도구·기관 서비스)이다.
SKIP_HOST = re.compile(
    r"youtube\.com|youtu\.be|kakao\.com|github\.com|github\.io|gitlab\.aigov"
    r"|threads\.com|facebook\.com|instagram\.com|linkedin\.com|^x\.com|twitter\.com"
    # 정부 도메인을 통째로 막지 않는다 — 정책브리핑은 article:published_time을 제대로 달아
    # 기사로 판별되고, 데이터 포털·업무 시스템은 그 표지가 없어 어차피 걸러진다.
    # 예전에 `korea\.kr`를 앵커 없이 두어 `thekorea.kr`(언론사)까지 함께 배제되기도 했다.
    r"|vercel\.app|pages\.dev|netlify\.app|gitlab\.aigov\.go\.kr"
    r"|claude\.ai|chatgpt\.com|openai\.com|anthropic\.com|huggingface\.co"
    r"|notion\.|docs\.google|drive\.google|forms\.gle|google\.com"
    r"|wikidocs\.net|kyobobook|arca\.live|status\.|localhost|^\d+\.\d+\.\d+\.\d+"
    r"|namu\.wiki|wikipedia\.org|fnevent|eventus\.|onoffmix|festa\.io",
    re.I,
)

TRACKING = re.compile(r"^(utm_|fbclid|gclid|igshid|spm|from|ref|pWise)", re.I)


def canon(url: str) -> str:
    """추적 꼬리표를 떼어 같은 기사가 여러 건으로 세어지지 않게 한다."""
    try:
        p = urlparse(url)
    except ValueError:
        return url
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    return urlunparse((p.scheme, p.netloc, p.path.rstrip("/") or "/", p.params, urlencode(q), ""))


def scan() -> dict[str, dict]:
    seen: set[tuple] = set()
    out: dict[str, dict] = defaultdict(lambda: {"shares": 0, "dates": set(), "sources": set()})
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
            found = {canon(u.rstrip(".,)")) for u in URL_RE.findall(text)}
            found = {u for u in found
                     if not SKIP_HOST.search((urlparse(u).hostname or "").replace("www.", ""))}
            if not found:
                continue
            mid = msg.get("id")
            key = ("id", mid) if mid else ("txt", text[:80])
            if key in seen:
                continue
            seen.add(key)
            when = (msg.get("timestamp") or msg.get("date") or "")[:10]
            for u in found:
                rec = out[u]
                rec["shares"] += 1
                rec["sources"].add(source)
                if when:
                    rec["dates"].add(when)
    return out


# content 값은 여는 따옴표와 짝이 맞는 따옴표에서만 끊어야 한다. 한 종류라도 [^"\']* 로 잡으면
# 한국어 기사 제목에 흔한 작은따옴표에서 잘려 "정부, '국가 AI'…"가 "정부,"로 남는다.
def _meta(prop: str) -> re.Pattern:
    return re.compile(
        r'<meta[^>]+(?:property|name)=["\']' + prop + r'["\'][^>]*content=(["\'])(.*?)\1',
        re.I | re.S)


META = {
    "type": _meta(r"og:type"),
    "title": _meta(r"og:title"),
    "site": _meta(r"og:site_name"),
    "pub": _meta(r"(?:article:published_time|og:article:published_time|pubdate|date)"),
}
TITLE_TAG = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def probe(url: str) -> dict | None:
    """페이지를 열어 기사 표지를 확인한다. 기사가 아니거나 못 열면 None."""
    try:
        res = subprocess.run(
            ["/usr/bin/curl", "-sL", "--max-time", "20", "--max-filesize", "3000000",
             "-A", "Mozilla/5.0 (compatible; PAX-archive/1.0)", url],
            capture_output=True, timeout=30,
        )
    except Exception:
        return None
    body = res.stdout.decode("utf-8", "replace")
    if not body:
        return None
    def grab(key: str) -> str:
        m = META[key].search(body)
        return m.group(2).strip() if m else ""

    og_type, pub = grab("type"), grab("pub")
    if og_type.lower() != "article" and not pub:
        return None  # 기사 표지가 없으면 기사로 세지 않는다
    title = grab("title")
    if not title:
        m = TITLE_TAG.search(body)
        title = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
    title = html.unescape(title).strip()
    if not title:
        return None
    outlet = html.unescape(grab("site")).strip()
    if not outlet:
        outlet = (urlparse(url).hostname or "").replace("www.", "")
    return {"title": title[:160], "outlet": outlet[:40], "published": pub[:40]}


def norm_date(raw: str) -> str:
    """발행일 표기가 매체마다 달라(ISO, 2026.08.12, "August 12, 2026") 그대로 두면
    문자열 정렬이 뒤섞인다 — ISO 하나로 맞추고, 못 읽으면 비워 둔다."""
    raw = (raw or "").strip()
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return m.group(0)
    m = re.search(r"(\d{4})[./](\d{1,2})[./](\d{1,2})", raw)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%d %B %Y", "%Y%m%d"):
        try:
            return datetime.datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


# og:site_name을 안 다는 곳 몇 곳만 사람이 읽는 이름으로 바꾼다(호스트가 그대로 노출되면 뭔지 모른다).
HOST_NAME = {
    "korea.kr": "정책브리핑",
    "m.korea.kr": "정책브리핑",
    "news.seoul.go.kr": "서울시 뉴스",
}

SEP = re.compile(r"[\s|·\-–—:>]+$")


def tidy(title: str, outlet: str, host: str = "") -> tuple[str, str]:
    """매체가 제목 끝에 자기 이름을 붙여 두는 관행 때문에 목록이 두 번 읽힌다 — 떼어 낸다.

    og:site_name에 헤드라인을 그대로 넣어 두는 매체가 있어, 매체명이 제목만큼 길거나
    제목의 앞머리와 겹치면 매체명으로 보지 않고 호스트로 되돌린다."""
    outlet = SEP.sub("", outlet).strip()
    title = title.strip()
    if outlet and (len(outlet) > 24 or (title and title.startswith(outlet[:12]))):
        outlet = host
    outlet = HOST_NAME.get(outlet, outlet) or HOST_NAME.get(host, host)
    if outlet:
        # "제목 - 매체명", "제목 | 매체명" 꼴을 제거한다(매체명이 그대로 붙은 경우만).
        tail = re.compile(r"\s*[|\-–—]\s*" + re.escape(outlet) + r"\s*$", re.I)
        title = tail.sub("", title)
    title = SEP.sub("", title).strip()
    return title, outlet


def main() -> int:
    found = scan()
    try:
        cache = json.load(open(CACHE, encoding="utf-8"))
    except Exception:
        cache = {}

    todo = [u for u in found if u not in cache]
    if todo:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            for url, meta in zip(todo, ex.map(probe, todo)):
                cache[url] = meta  # 실패도 기록해 다음 회차에 다시 두드리지 않는다

    items = []
    for url, rec in found.items():
        meta = cache.get(url)
        if not meta:
            continue
        host = (urlparse(url).hostname or "").replace("www.", "")
        title, outlet = tidy(meta["title"], meta.get("outlet", ""), host)
        # 제목을 제대로 못 받은 것(매체명 조각만 남은 경우 등)은 목록에 두지 않는다.
        if len(title) < 8:
            continue
        dates = sorted(rec["dates"])
        items.append({
            "url": url,
            "title": title,
            "outlet": outlet,
            "published": norm_date(meta.get("published", "")),
            "shares": rec["shares"],
            "first_shared": dates[0] if dates else "",
            "last_shared": dates[-1] if dates else "",
            "sources": sorted(rec["sources"]),
        })
    items.sort(key=lambda x: (x["last_shared"], x["shares"]), reverse=True)

    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(items),
        "articles": items,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")
    outlets = len({i["outlet"] for i in items})
    print(f"site/data/news.json ← 기사 {len(items)}건 · 매체 {outlets}곳 "
          f"(후보 {len(found)}건 중 기사 아님·조회 불가 {len(found) - len(items)}건 제외)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
