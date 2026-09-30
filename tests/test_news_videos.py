"""공유 뉴스·영상 수집의 판단 — 원본은 임시 폴더에, 네트워크는 가짜로 바꿔 끼운다."""
import json
import types

import build_news as bn
import build_videos as bv


def _raw(tmp_path, name, rows):
    (tmp_path / name).write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    return str(tmp_path / "*.json")


def _body(html, charset="utf-8"):
    return types.SimpleNamespace(stdout=html.encode(charset), returncode=0)


# ---- 뉴스 ------------------------------------------------------------------------------
def test_canon_strips_tracking_but_keeps_real_query():
    assert bn.canon("https://n.example/a/?utm_source=x&id=3&fbclid=y") == "https://n.example/a?id=3"
    assert bn.canon("https://n.example/") == "https://n.example/"


def test_scan_counts_each_message_once_and_skips_non_news_hosts(tmp_path, monkeypatch):
    rows = [
        {"id": "m1", "text": "기사 https://news.example/a?utm_source=kakao 와 https://github.com/a/b",
         "timestamp": "2026-09-30T23:10:00Z"},
        {"id": "m1", "text": "같은 메시지 https://news.example/a"},                # 중복 메시지
        {"id": "m2", "text": "다시 공유 https://news.example/a.", "timestamp": "2026-09-29T01:00:00+09:00"},
        {"id": "m3", "text": "영상 https://youtu.be/abcdefghijk"},                  # 영상은 뉴스가 아니다
        "깨진 행",
    ]
    monkeypatch.setattr(bn, "RAW_GLOB", _raw(tmp_path, "2026-09-30-kakao.json", rows))
    out = bn.scan()
    assert set(out) == {"https://news.example/a"}
    rec = out["https://news.example/a"]
    assert rec["shares"] == 2 and rec["sources"] == {"kakao"}
    assert rec["dates"] == {"2026-10-01", "2026-09-29"}  # KST 기준 날짜


def test_decode_body_follows_declared_korean_charset():
    raw = '<meta charset="euc-kr"><title>공공 AX 소식</title>'.encode("cp949")
    assert "공공 AX 소식" in bn.decode_body(raw)
    assert bn.decode_body(b'<meta charset="nope">abc') == '<meta charset="nope">abc'


def test_probe_accepts_articles_and_rejects_portals(monkeypatch):
    article = ('<meta property="og:type" content="article">'
               '<meta property="og:title" content="정부, \'국가 AI\' 전략 발표">'
               '<meta property="og:site_name" content="가상일보">')
    monkeypatch.setattr(bn, "curl", lambda *a, **k: _body(article))
    got = bn.probe("https://news.example/view/1")
    assert got["title"] == "정부, '국가 AI' 전략 발표" and got["outlet"] == "가상일보" and got["kind"] == "기사"

    monkeypatch.setattr(bn, "curl", lambda *a, **k: _body("<title>포털 메인</title>"))
    assert bn.probe("https://portal.example/") is None
    monkeypatch.setattr(bn, "curl", lambda *a, **k: None)
    assert bn.probe("https://down.example/") is None


def test_probe_reads_government_releases_by_board_title(monkeypatch):
    page = "<title>행정안전부 | 보도자료 | 공공부문 AI 도입 지원 사업 착수</title>"
    monkeypatch.setattr(bn, "curl", lambda *a, **k: _body(page))
    got = bn.probe("https://www.mois.go.kr/frt/bbs/1")
    assert got["kind"] == "보도자료" and got["outlet"] == "행정안전부"
    assert got["title"] == "공공부문 AI 도입 지원 사업 착수"
    monkeypatch.setattr(bn, "curl", lambda *a, **k: _body("<title>HOME > 알림마당 > 공지사항</title>"))
    assert bn.probe("https://www.mois.go.kr/frt/bbs/2") is None  # 메뉴 이름뿐인 화면


def test_norm_date_and_tidy():
    assert [bn.norm_date(d) for d in ("2026-08-12T09:00:00+09:00", "2026.8.3", "August 12, 2026", "어제")] \
        == ["2026-08-12", "2026-08-03", "2026-08-12", ""]
    assert bn.tidy("AI 전환 가속 - 가상일보", "가상일보") == ("AI 전환 가속", "가상일보")
    assert bn.tidy("정책 소식", "", "korea.kr") == ("정책 소식", "정책브리핑")


# ---- 영상 ------------------------------------------------------------------------------
def test_video_scan_collects_all_link_forms(tmp_path, monkeypatch):
    rows = [{"id": "t1", "text": "https://www.youtube.com/watch?v=AAAAAAAAAAA&t=3 https://youtu.be/BBBBBBBBBBB"},
            {"text": "쇼츠 https://youtube.com/shorts/CCCCCCCCCCC", "date": "2026-09-01"},
            {"text": "쇼츠 https://youtube.com/shorts/CCCCCCCCCCC", "date": "2026-09-01"}]  # id 없는 같은 글
    monkeypatch.setattr(bv, "RAW_GLOB", _raw(tmp_path, "2026-09-01-threads.json", rows))
    vids = bv.scan()
    assert set(vids) == {"AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC"}
    assert vids["CCCCCCCCCCC"]["shares"] == 1 and vids["CCCCCCCCCCC"]["sources"] == {"threads"}


def test_fetch_meta_needs_a_title(monkeypatch):
    monkeypatch.setattr(bv, "curl_json", lambda url: {"title": " 발표 ", "author_name": "채널"})
    assert bv.fetch_meta("AAAAAAAAAAA") == {"title": "발표", "channel": "채널"}
    monkeypatch.setattr(bv, "curl_json", lambda url: None)      # 비공개·삭제
    assert bv.fetch_meta("AAAAAAAAAAA") is None
    monkeypatch.setattr(bv, "curl_json", lambda url: {"title": ""})
    assert bv.fetch_meta("AAAAAAAAAAA") is None
