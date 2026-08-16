# 공공AX 챔피언 목록 설계

날짜: 2026-08-16 · 상태: 승인됨

## 목적

아카이브 사례(171건+)의 실제 개발자가 누구이고 어디 소속인지를 **공개 프로필 기반**으로 정리한
"챔피언" 디렉토리를 사이트에 제공한다. 자발적으로 공공AX 도구를 만드는 실무자들을 조명하고,
기관·커뮤니티가 협업 상대를 찾는 진입점이 되게 한다.

## 결정 사항 (사용자 확정)

| 결정 | 내용 |
|---|---|
| 공개 범위 | GitHub·공공 GitLab **공개 프로필에 본인이 게시한 정보만** 사이트에 공개. 유추 소속은 "추정" 배지로 구분 |
| 동일인 연결 | **증거 기반 교차 연결만** — 같은 저장소를 공유한 계정끼리만 병합, 근거를 데이터에 기록. 오픈채팅 닉네임은 연결에 사용하지 않음 |
| 기본 정렬 | **동등 디렉토리(가나다순 카드)**. 종합 점수·사례 수 정렬은 토글로 제공, 점수 산식은 페이지에 공개 |
| 갱신 | 정기 수집 파이프라인에 통합해 자동 갱신 |

## 구성 요소

### 1. `scripts/build_champions.py` (신규)

입력: `data/cases.json`, `site/data/evaluations.json`, `docs/champion_links.json`, (캐시) `data/champion_profiles.json`
출력: `site/data/champions.json`

처리 순서:
1. cases.json의 `link`·`case_url`에서 계정 추출 — `github.com/<acct>`, `gitlab.aigov.go.kr/<acct>`,
   `<acct>.github.io`, threads 게시물의 `@handle`
2. GitHub API(`/users/<acct>`)·GitLab API(`/api/v4/users?username=`)로 공개 프로필
   (표시이름·회사/소속·프로필 URL) 조회. 결과는 `data/champion_profiles.json`에 캐시(커밋 제외),
   실패 시 캐시 사용·없으면 계정명만 표시
3. `docs/champion_links.json`의 승인된 연결로 계정들을 챔피언 단위로 병합
4. 챔피언별 통계 계산: 사례 수, 최고 AX 단계(evaluations.json 참조), 스타 합(popularity),
   누적 북마크는 클라이언트에서 합산
5. `champions.json` 기록

### 2. `docs/champion_links.json` (큐레이터 관리)

```json
[
  {
    "champion": "chrisryugj",
    "accounts": ["github:chrisryugj", "threads:chris_gomdori"],
    "affiliation": {"value": "광진구", "inferred": true,
      "evidence": "광진구 보도자료·본인 게시물(자기소개)"},
    "evidence": "게시물 DWbsucHCb2X에서 github.com/chrisryugj/korean-law-mcp 링크 확인"
  }
]
```
- `evidence` 없는 연결은 병합에 사용하지 않는다 — 해당 항목을 건너뛰고 경고를 출력하며, 계정들은 단독 챔피언으로 남는다 (오류 처리 절과 동일한 규칙)
- 이 파일에 없는 계정은 각각 단독 챔피언

### 3. `site/champions.html` + `site/champions.js` (신규)

- 메뉴: "AX 평가" 다음 "챔피언" (전 페이지 nav에 추가)
- 카드 그리드: 표시이름(없으면 계정명), 소속(+"추정" 배지), 계정 아이콘 링크
  (GitHub/공공GitLab/Threads), 대표 사례 3개(사례 아카이브로 링크), 사례 수·최고 AX 단계
- 정렬 토글: **가나다순(기본)** | 종합 점수 | 사례 수
- 종합 점수 = 사례 수×3 + 최고 AX 단계 가중(Ready 1/Enabled 2/First 4/Native 8)
  + log10(스타 합+1)×2 + 북마크 합×1 — 산식을 페이지 하단에 명시
- 데이터 삽입은 전부 textContent/createElement (기존 XSS 방지 관례)

### 4. 프라이버시 장치

- 공개 프로필에 없는 정보(실명·소속·연락처)는 싣지 않는다
- 유추 소속은 반드시 "추정" 배지 + 데이터에 근거 기록
- 페이지 하단: 출처 설명("GitHub·공공 GitLab 공개 프로필 기반") +
  "본인 요청 시 즉시 제외" 안내(hollobit@etri.re.kr 링크)
- 오픈채팅 발언·닉네임은 어떤 형태로도 사용하지 않는다

### 5. 파이프라인 통합

- `scripts/collect_prompt.md` 5단계에 `python3 scripts/build_champions.py` 추가
- git add 목록에 `site/data/champions.json` 추가
- 프로필 API 실패는 치명 오류가 아님(캐시 폴백) — 수집 절차의 "실패해도 진행" 원칙 유지

## 오류 처리

- API 한도·네트워크 실패: 캐시 사용, 없으면 계정명만. 로그로 경고
- 잘못된 champion_links 항목(근거 누락, 알 수 없는 계정): 빌드 중단이 아니라 해당 항목 건너뛰고 경고
- 사례-챔피언 참조 무결성: champions.json의 사례 id가 cases.json에 없으면 경고

## 테스트

- 단위: 계정 추출 정규식(4개 패턴), 연결 병합(근거 필수 규칙), 점수 산식
- 통합: 실제 cases.json으로 빌드 → 챔피언 수 = 계정 수 - 병합 수 검증
- 화면: browse로 카드 렌더링·정렬 토글·배지 표시 확인

## 범위 밖 (YAGNI)

- 챔피언 개인 페이지(카드로 충분), 팔로우/알림, 기여 그래프, 오픈채팅 발언 통계
