# PAX — 모두의 공공AX 사례 아카이브

Threads의 `공공AX` 태그와 카카오톡 오픈채팅 "공공AX 네트워크"에서 공공부문 AI 전환(AX,
AI Transformation) 사례를 **하루 3회(07:00·15:00·23:00)** 수집하고, AI가 선별·재작성한 요약을
결정적 스크립트가 검증·병합해 GitHub Pages로 공개하는 정적 아카이브입니다.

- 사이트: **https://hollobit.github.io/PAX/**
- 2026-08-30 기준 사례 240건 · 챔피언 109명 · 오픈채팅 참여자 1,400여 명

## 사이트 구성

| 페이지 | 내용 |
|---|---|
| [사례 아카이브](https://hollobit.github.io/PAX/) | 카드·목록·태그 보기, 검색·필터(기관유형·업무·지역·실행환경), 북마크, CSV/PDF 내보내기 |
| [AX 수준 평가](https://hollobit.github.io/PAX/dashboard.html) | 4축 평가 방법론·성숙도 사다리·사례별 판정 |
| [데이터 관측소](https://hollobit.github.io/PAX/observatory.html) | 공공AX 지수, MCP·저장소·라이선스·모델 현황, 커뮤니티 활력 지표 |
| [격차 지도](https://hollobit.github.io/PAX/gap-map.html) | 광역·중앙행정기관별 관측 현황 |
| [전이 플레이북](https://hollobit.github.io/PAX/playbook.html) | 사례의 타 기관 재사용 경로·자가진단 |
| [챔피언](https://hollobit.github.io/PAX/champions.html) | 공개 프로필 기반 공공AX 개발자 디렉토리(인증 티어 연동) |
| [MCP 검증](https://hollobit.github.io/PAX/mcp-review.html) | MCP 사례 6축 보안·안전 검증 매트릭스 |
| [안내서·가이드라인](https://hollobit.github.io/PAX/guidelines.html) · [변경 기록](https://hollobit.github.io/PAX/changelog.html) | 기관 공개 문서 모음, 사례 추가 이력 |

## 익명화 정책

- **공개 정보**: AI가 원문을 재작성한 요약만 공개합니다. 원문을 그대로 옮기지 않습니다.
- **작성자 익명화**: 제보자·작성자의 닉네임 등 개인 정보는 공개하지 않습니다.
- **원문 비공개**: 카카오톡 오픈채팅 원문은 저장소에도 올리지 않습니다(`data/raw/` 등은 .gitignore).
- **Threads**: 공개된 원문 게시물의 링크를 함께 제공합니다.
- **챔피언**: 공개 프로필(GitHub·공공 깃랩 등)에 근거한 정보만 표시합니다.

## 파이프라인 구조

수집(원문 읽기)과 선별·요약(실제 공공AX 사례인지 판단하고 재작성)은 AI 세션이
`scripts/collect_prompt.md` 절차서를 따라 수행하고, 검증·중복 제거·병합·게시(스키마 검사,
익명화 화이트리스트 검사, `data/cases.json` append-only 갱신, 사이트 데이터 빌드)는 결정적
스크립트(`scripts/pax/`, `scripts/build_*.py`)가 수행합니다. AI 판단은 매번 달라질 수 있지만,
공개 데이터에 반영되기 전 마지막 관문은 항상 같은 스크립트가 통과시킵니다.

```
Threads·카카오톡 ──AI 수집·선별──▶ data/incoming/*.json
   ──pax.merge(스키마·익명화·중복)──▶ data/cases.json
   ──pax.publish·build_*──▶ site/data/*.json, site/case/*.html, site/thumbs/
   ──git push(main)──▶ GitHub Pages
```

## 저장소 안내

- `AGENTS.md` — 사람·AI 에이전트가 이 저장소에서 지킬 규칙과 구조 (정본)
- `HISTORY.md` — 기능·운영 변경 연혁
- `docs/superpowers/specs`·`plans` — 설계서·구현 계획, `docs/reports` — 정책 보고서
- 사례 제보: 오픈채팅 "공공AX 네트워크" 또는 GitHub Issue/PR

## 로컬 테스트

```bash
PYTHONPATH=scripts python3 -m pytest tests/
```
