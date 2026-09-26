#!/usr/bin/env python3
"""3D PAX — 정부·공공기관 소재지 좌표 (사용자 지시 2026-09-27: 기관 주소 기반 위치 표시).

기관명·키워드·도로명 주소는 아래 표에 사람이 적는다. 좌표는 OpenStreetMap Nominatim으로 한 번 찾아
site/data/org-locations.json에 고정한다(사이트는 실행 중에 지오코딩하지 않는다).
찾은 점이 적어 둔 시군구 경계(korea-sgg.json) 안에 들지 않으면 그 시군구 대표점으로 물러난다 — precision 'sgg'.
주소를 확신하지 못하는 기관은 address를 비워 두고 이름으로 찾되, 건물·기관 유형만 받는다(버스정류장 제외).

    python3 scripts/build_org_locations.py     # Nominatim 정책: 초당 1건, 식별 가능한 User-Agent
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

SGG = Path("site/data/korea-sgg.json")
OUT = Path("site/data/org-locations.json")
UA = "PAX-3D-map-build (https://github.com/hollobit/PAX)"
NAME_TYPES = {"government", "office", "educational_institution", "research_institute", "company",
              "public_building", "building", "yes", "commercial", "university", "townhall"}

# (공식명, 매칭 키워드, 도로명 주소 또는 None, 시도, 시군구)
INSTITUTIONS = [
    ("행정안전부", ["행정안전부", "행안부", "AI 정부 실험실", "AI정부실험실", "AI실험실"], "세종특별자치시 도움6로 42", "세종", "세종시"),
    ("과학기술정보통신부", ["과학기술정보통신부", "과기정통부", "과학기술혁신본부"], "세종특별자치시 가름로 194", "세종", "세종시"),
    ("재정경제부", ["재정경제부", "재경부", "기획재정부", "기재부"], "세종특별자치시 갈매로 477", "세종", "세종시"),
    ("기획예산처", ["기획예산처"], None, "세종", "세종시"),
    ("보건복지부", ["보건복지부", "복지부"], "세종특별자치시 도움4로 13", "세종", "세종시"),
    ("고용노동부", ["고용노동부", "노동부"], "세종특별자치시 한누리대로 422", "세종", "세종시"),
    ("기후에너지환경부", ["기후에너지환경부", "환경부"], "세종특별자치시 도움6로 11", "세종", "세종시"),
    ("법제처", ["법제처"], "세종특별자치시 도움5로 20", "세종", "세종시"),
    ("소방청", ["소방청"], "세종특별자치시 정부2청사로 13", "세종", "세종시"),
    ("한국보건사회연구원", ["한국보건사회연구원"], "세종특별자치시 시청대로 370", "세종", "세종시"),
    ("과학기술정책연구원", ["과학기술정책연구원", "STEPI"], "세종특별자치시 시청대로 370", "세종", "세종시"),
    ("개인정보보호위원회", ["개인정보보호위원회"], "서울특별시 종로구 세종대로 209", "서울", "종로구"),
    ("통일부", ["통일부"], "서울특별시 종로구 세종대로 209", "서울", "종로구"),
    ("경찰청", ["경찰청"], "서울특별시 서대문구 통일로 97", "서울", "서대문구"),
    ("한국과학기술연구원", ["한국과학기술연구원", "KIST"], "서울특별시 성북구 화랑로14길 5", "서울", "성북구"),
    ("서울올림픽기념국민체육진흥공단", ["서울올림픽기념국민체육진흥공단", "국민체육진흥공단"], "서울특별시 송파구 양재대로 1239", "서울", "송파구"),
    ("코레일유통", ["코레일유통"], None, "서울", "영등포구"),
    ("한국사회보장정보원", ["한국사회보장정보원", "사회보장정보원"], None, "서울", "중구"),
    ("국제방송교류재단", ["국제방송교류재단", "아리랑국제방송"], None, "서울", "마포구"),
    ("법무부", ["법무부"], "경기도 과천시 관문로 47", "경기", "과천시"),
    ("한국학중앙연구원", ["한국학중앙연구원"], "경기도 성남시 분당구 하오개로 323", "경기", "성남시"),
    ("한국국제협력단", ["한국국제협력단", "KOICA"], "경기도 성남시 수정구 대왕판교로 825", "경기", "성남시"),
    ("병무청", ["병무청"], "대전광역시 서구 청사로 189", "대전", "서구"),
    ("조달청", ["조달청"], "대전광역시 서구 청사로 189", "대전", "서구"),
    ("지식재산처", ["지식재산처", "특허청"], "대전광역시 서구 청사로 189", "대전", "서구"),
    ("국가데이터처", ["국가데이터처", "통계청"], "대전광역시 서구 청사로 189", "대전", "서구"),
    ("한국전자통신연구원", ["한국전자통신연구원", "ETRI", "Electronics Telecommunications Research Institute"],
     "대전광역시 유성구 가정로 218", "대전", "유성구"),
    ("한국철도공사", ["한국철도공사", "코레일"], "대전광역시 동구 중앙로 240", "대전", "동구"),
    ("한국지능정보사회진흥원", ["한국지능정보사회진흥원", "NIA"], "대구광역시 동구 첨단로 53", "대구", "동구"),
    ("농촌진흥청", ["농촌진흥청"], "전북특별자치도 전주시 덕진구 농생명로 300", "전북", "전주시"),
    ("한국국토정보공사", ["한국국토정보공사", "LX"], "전북특별자치도 전주시 덕진구 기지로 120", "전북", "전주시"),
    ("한국인터넷진흥원", ["한국인터넷진흥원", "KISA"], "전라남도 나주시 진흥길 9", "전남", "나주시"),
    ("국립공원공단", ["국립공원공단"], "강원특별자치도 원주시 혁신로 22", "강원", "원주시"),
    ("한국광해광업공단", ["한국광해광업공단"], "강원특별자치도 원주시 혁신로 199", "강원", "원주시"),
    ("정보통신산업진흥원", ["정보통신산업진흥원", "NIPA"], "충청북도 진천군 덕산읍 정통로 10", "충북", "진천군"),
    ("한국서부발전", ["한국서부발전"], "충청남도 태안군 태안읍 중앙로 285", "충남", "태안군"),
    ("중소벤처기업진흥공단", ["중소벤처기업진흥공단", "중진공"], "경상남도 진주시 동진로 430", "경남", "진주시"),
    ("우주항공청", ["우주항공청"], None, "경남", "사천시"),
    ("동남지방데이터청", ["동남지방데이터청", "동남지방통계청"], None, "부산", "연제구"),
]


def in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        (xi, yi), (xj, yj) = ring[i], ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_polys(x, y, polys):
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def nominatim(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "countrycodes": "kr", "format": "jsonv2", "limit": 5, "accept-language": "ko"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.load(r)
    time.sleep(1.1)
    return out


def locate(name, address, sgg):
    """→ (lon, lat, precision, 표시 주소)"""
    candidates = nominatim(address) if address else [
        c for c in nominatim(name) if c.get("type") in NAME_TYPES and name[:4] in c.get("display_name", "")]
    for c in candidates:
        lon, lat = float(c["lon"]), float(c["lat"])
        if in_polys(lon, lat, sgg["polys"]):
            shown = address or " ".join(reversed(c["display_name"].split(", ")[:-2]))
            return lon, lat, "address" if address else "osm-name", shown
    lon, lat = sgg["center"]
    return lon, lat, "sgg", None


def main():
    sggs = {(s["region"], s["name"]): s for s in json.loads(SGG.read_text())["sgg"]}
    out = []
    for name, kws, address, region, sgg_name in INSTITUTIONS:
        sgg = sggs[(region, sgg_name)]
        lon, lat, precision, shown = locate(name, address, sgg)
        out.append({"name": name, "kw": kws, "address": shown, "region": region, "sgg": sgg_name,
                    "lon": round(lon, 5), "lat": round(lat, 5), "precision": precision})
        print(f"{precision:8} {region} {sgg_name:8} {name} — {shown or '(시군구 대표점)'}")
    OUT.write_text(json.dumps({
        "attribution": "좌표: © OpenStreetMap contributors (Nominatim) · 주소는 기관 공개 주소를 사람이 적은 값",
        "institutions": out,
    }, ensure_ascii=False, indent=1))
    print(f"{OUT} ← {len(out)}개 기관")


if __name__ == "__main__":
    main()
