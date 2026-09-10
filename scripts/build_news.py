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

# og:type도 발행시각도 달지 않는 매체가 있다(헬스조선 등). 그때는 '매체 이름이 있고
# 주소가 기사 모양인가'로 받는다 — 매체명은 발행물이라는 표시이고, 아래 경로 모양은
# 목록·소개 화면이 아니라 개별 기사에 붙는다.
# 기사가 내려간 자리에 안내 문구만 남은 화면이 있다 — 제목이 그 문구이면 목록에 두지 않는다.
DEAD_TITLE = re.compile(
    r"삭제된 기사|삭제되었습니다|존재하지 않는|찾을 수 없|서비스가 종료|권한이 없|로그인이 필요"
    r"|page not found|not found|access denied|error", re.I)

ARTICLE_PATH = re.compile(
    r"articleView|idxno=|/news/|/article/|/articles/|html_dir|/view/|[?&]no=\d|/\d{6,}", re.I)


CHARSET = re.compile(rb"""charset=["']?\s*([\w-]+)""", re.I)


def decode_body(raw: bytes) -> str:
    """문서가 선언한 인코딩을 따른다 — 국내 매체 중에 아직 EUC-KR로 내보내는 곳이 있어,
    UTF-8로만 읽으면 제목이 깨진 채로 목록에 실린다."""
    m = CHARSET.search(raw[:4096])
    enc = (m.group(1).decode("ascii", "ignore").lower() if m else "utf-8")
    if enc in ("euc-kr", "ks_c_5601-1987", "ksc5601", "cp949"):
        enc = "cp949"
    try:
        return raw.decode(enc, "replace")
    except LookupError:
        return raw.decode("utf-8", "replace")


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
    body = decode_body(res.stdout)
    if not body:
        return None
    def grab(key: str) -> str:
        m = META[key].search(body)
        return m.group(2).strip() if m else ""

    host = (urlparse(url).hostname or "").replace("www.", "").lower()
    og_type, pub, site = grab("type"), grab("pub"), grab("site")
    is_article = (og_type.lower() == "article" or bool(pub)
                  or (bool(site) and bool(ARTICLE_PATH.search(url))))

    if not is_article and GOV_HOST.search(host):
        m = TITLE_TAG.search(body)
        raw = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else ""
        kind = ("보도자료" if GOV_RELEASE.search(raw)
                else "공고·안내" if GOV_NOTICE.search(raw) else "")
        head = gov_headline(raw)
        # 게시판 표지가 없으면 포털·데이터셋 화면이고, 머리기사가 짧으면 목록 화면이다.
        if not kind or len(head) < 10 or GOV_NAV_ONLY.search(head):
            return None
        return {"title": head[:160], "outlet": HOST_NAME.get(host, host)[:40],
                "published": "", "kind": kind}

    if not is_article:
        return None  # 기사 표지가 없으면 기사로 세지 않는다
    title = grab("title")
    if not title:
        m = TITLE_TAG.search(body)
        title = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
    title = html.unescape(title).strip()
    # 인코딩을 잘못 짚었으면 대체문자가 섞인다 — 깨진 제목은 목록에 두지 않는다.
    if not title or title.count("\ufffd") > 2 or DEAD_TITLE.search(title):
        return None
    outlet = html.unescape(grab("site")).strip()
    if not outlet:
        outlet = (urlparse(url).hostname or "").replace("www.", "")
    return {"title": title[:160], "outlet": outlet[:40], "published": pub[:40], "kind": "기사"}


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
    "mois.go.kr": "행정안전부",
    "msit.go.kr": "과학기술정보통신부",
    "mof.go.kr": "해양수산부",
    "sotong.go.kr": "소통혁신24",
    "nia.or.kr": "한국지능정보사회진흥원",
}

# 기관 게시물 판별 — 정부 페이지는 og:type을 달지 않아 기사 표지로는 걸러지지 않는다.
# 대신 제목에 남는 게시판 이름으로 가른다. 포털 메인·데이터셋 화면에는 이 표지가 없어
# 자연히 빠지고, 목록 화면은 표지만 있고 머리기사가 없어 길이에서 걸린다.
GOV_HOST = re.compile(r"\.go\.kr$|\.or\.kr$|^korea\.kr$", re.I)
GOV_RELEASE = re.compile(r"보도자료|정책뉴스|브리핑|참고자료|설명자료", re.I)
# 제목이 빵부스러기뿐인 기관 페이지가 있다(예: "HOME > 알림마당 > 공지사항 | 기관명").
# 이때 남는 것은 머리기사가 아니라 메뉴 이름이므로 게시물로 세지 않는다.
GOV_NAV_ONLY = re.compile(r"(공지사항|알림마당|주요사업|사업소개|게시판|자료실|목록|메인|홈|브리핑룸|뉴스·소식)$")
GOV_NOTICE = re.compile(r"공모|공고|알림|새소식|수상작|안내|신청|접수|자료실|다운로드|운영 ?자료", re.I)
CRUMB = re.compile(r"\s*[|>›»]\s*|\s+-\s+")


def gov_headline(raw_title: str) -> str:
    """빵부스러기(사이트명 · 게시판 이름)를 걷어 내고 머리기사만 남긴다."""
    parts = [p.strip(" -|>") for p in CRUMB.split(raw_title) if p.strip()]
    if not parts:
        return ""
    head = max(parts, key=len)
    head = GOV_RELEASE.sub("", head).strip(" -|")
    return head

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
        # 구분자는 매체마다 다르고(ㅣ·|·-·:) 아예 없이 띄어쓰기만 두는 곳도 있다.
        tail = re.compile(r"\s*[|\-–—:·ㅣ]?\s*" + re.escape(outlet) + r"\s*$", re.I)
        title = tail.sub("", title)
    title = SEP.sub("", title).strip()
    return title, outlet


def main() -> int:
    found = scan()
    try:
        cache = json.load(open(CACHE, encoding="utf-8"))
    except Exception:
        cache = {}

    # 실패를 영영 기억하면 그때 막혔던 곳이 되살아나도 다시 못 본다 — 이레 지나면 다시 두드린다.
    stale = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
    todo = [u for u in found
            if u not in cache
            or (cache[u] is None)
            or (isinstance(cache[u], dict) and cache[u].get("failed_at", "9999") < stale
                and not cache[u].get("title"))]
    if todo:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            today_iso = datetime.date.today().isoformat()
            for url, meta in zip(todo, ex.map(probe, todo)):
                # 실패도 날짜와 함께 기록해 매 회차 다시 두드리지 않되, 영영 묻어 두지도 않는다.
                cache[url] = meta if meta else {"failed_at": today_iso}

    items = []
    for url, rec in found.items():
        meta = cache.get(url)
        if not meta or not meta.get("title"):
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
            "kind": meta.get("kind", "기사"),
            "shares": rec["shares"],
            "first_shared": dates[0] if dates else "",
            "last_shared": dates[-1] if dates else "",
            "sources": sorted(rec["sources"]),
        })
    # 같은 글이 모바일 주소·단축 주소·게시판 파라미터 차이로 여러 건이 되는 일이 잦다.
    # 제목과 매체가 같으면 한 글로 보고 합친다(공유 횟수는 더하고, 기간은 넓게 잡는다).
    merged: dict[tuple, dict] = {}
    for it in items:
        key = (it["title"], it["outlet"])
        prev = merged.get(key)
        if not prev:
            merged[key] = it
            continue
        prev["shares"] += it["shares"]
        prev["first_shared"] = min(x for x in (prev["first_shared"], it["first_shared"]) if x) \
            if (prev["first_shared"] or it["first_shared"]) else ""
        prev["last_shared"] = max(prev["last_shared"], it["last_shared"])
        prev["sources"] = sorted(set(prev["sources"]) | set(it["sources"]))
        if not prev["published"]:
            prev["published"] = it["published"]
    items = list(merged.values())
    # 동점일 때 순서가 실행마다 달라지면 내용이 같아도 파일이 통째로 다시 쓰여 매 회차 커밋에
    # 수백 줄 잡음이 남는다 — 주소를 마지막 기준으로 두어 순서를 고정한다.
    items.sort(key=lambda x: (x["last_shared"], x["shares"], x["url"]), reverse=True)

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
